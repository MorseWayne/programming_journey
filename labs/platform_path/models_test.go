package platformpath

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"io"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func request(id string) RewardRequest { return RewardRequest{"team-a", "u1", id, 10} }
func TestContract(t *testing.T) {
	for _, r := range []RewardRequest{{}, {"a", "u", "r", 0}, {"a", "u", "r", -1}} {
		if !errors.Is(r.Validate(), ErrInvalid) {
			t.Fatal(r)
		}
	}
	l := NewLedger()
	r, err := l.Grant(request("r1"))
	if err != nil || r.Balance != 10 || r.EventID != 1 {
		t.Fatal(r, err)
	}
}
func TestOwnership(t *testing.T) {
	l := NewLedger()
	_, _ = l.Grant(request("r1"))
	view := l.Pending()
	view[0].User = "attacker"
	if l.Pending()[0].User != "u1" {
		t.Fatal("caller mutated internal state")
	}
}
func TestConcurrentDuplicate(t *testing.T) {
	l := NewLedger()
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := l.Grant(request("same")); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if l.Balance("team-a", "u1") != 10 || len(l.Pending()) != 1 {
		t.Fatal("duplicate effect")
	}
}
func TestConflictAndTenant(t *testing.T) {
	l := NewLedger()
	_, _ = l.Grant(request("same"))
	r := request("same")
	r.Amount = 20
	if _, err := l.Grant(r); !errors.Is(err, ErrConflict) {
		t.Fatal(err)
	}
	r = request("same")
	r.Namespace = "team-b"
	if _, err := l.Grant(r); err != nil {
		t.Fatal(err)
	}
	if l.Balance("team-b", "u1") != 10 {
		t.Fatal("tenant collision")
	}
}
func TestReceiptIsOriginalResult(t *testing.T) {
	l := NewLedger()
	_, _ = l.Grant(request("r1"))
	_, _ = l.Grant(request("r2"))
	r, _ := l.Grant(request("r1"))
	if r.Balance != 10 || !r.Duplicate || l.Balance("team-a", "u1") != 20 {
		t.Fatal(r)
	}
}
func TestOutboxCrashWindow(t *testing.T) {
	l, s := NewLedger(), NewSink()
	_, _ = l.Grant(request("r1"))
	e := l.Pending()[0]
	if ok, err := s.Apply(e); !ok || err != nil {
		t.Fatal(ok, err)
	}
	if ok, err := s.Apply(l.Pending()[0]); ok || err != nil {
		t.Fatal(ok, err)
	}
	l.MarkSent(e.ID)
	if s.Effects() != 1 || len(l.Pending()) != 0 {
		t.Fatal("replay failed")
	}
}
func TestFencing(t *testing.T) {
	s := NewFencedStore()
	old := s.Activate("a/room")
	_ = s.Write("a/room", old, "old")
	now := s.Activate("a/room")
	if err := s.Write("a/room", now, "new"); err != nil {
		t.Fatal(err)
	}
	if err := s.Write("a/room", old, "late"); !errors.Is(err, ErrStale) {
		t.Fatal(err)
	}
	if s.Read("a/room") != "new" {
		t.Fatal("old writer won")
	}
}
func TestPipeline(t *testing.T) {
	var n atomic.Int64
	err := Run(context.Background(), 3, 2, []int{1, 2, 3, 4, 5}, func(context.Context, int) error { n.Add(1); return nil })
	if err != nil || n.Load() != 5 {
		t.Fatal(n.Load(), err)
	}
}
func TestPipelineCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	started, done := make(chan struct{}), make(chan error, 1)
	go func() {
		done <- Run(ctx, 1, 0, []int{1, 2, 3}, func(ctx context.Context, _ int) error { close(started); <-ctx.Done(); return ctx.Err() })
	}()
	<-started
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("did not stop")
	}
}
func TestPipelineFailure(t *testing.T) {
	want := errors.New("dependency failed")
	if err := Run(context.Background(), 2, 1, []int{1, 2}, func(context.Context, int) error { return want }); !errors.Is(err, want) {
		t.Fatal(err)
	}
}

type oneByteReader struct{ r io.Reader }

func (r oneByteReader) Read(p []byte) (int, error) {
	if len(p) > 1 {
		p = p[:1]
	}
	return r.r.Read(p)
}
func frame(body string) []byte {
	var b bytes.Buffer
	_ = binary.Write(&b, binary.BigEndian, uint32(len(body)))
	b.WriteString(body)
	return b.Bytes()
}
func TestFrame(t *testing.T) {
	stream := append(frame("hello"), frame("world")...)
	r := oneByteReader{bytes.NewReader(stream)}
	for _, want := range []string{"hello", "world"} {
		got, err := ReadFrame(r)
		if err != nil || string(got) != want {
			t.Fatal(string(got), err)
		}
	}
}
func TestFrameBoundaries(t *testing.T) {
	if _, err := ReadFrame(bytes.NewReader(frame("hello")[:7])); !errors.Is(err, io.ErrUnexpectedEOF) {
		t.Fatal(err)
	}
	var h [4]byte
	binary.BigEndian.PutUint32(h[:], MaxFrame+1)
	if _, err := ReadFrame(bytes.NewReader(h[:])); err == nil {
		t.Fatal("oversize accepted")
	}
}
func BenchmarkGrant(b *testing.B) {
	l := NewLedger()
	r := request("same")
	_, _ = l.Grant(r)
	b.ReportAllocs()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			_, _ = l.Grant(r)
		}
	})
}

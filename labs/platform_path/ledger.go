// Package platformpath contains original teaching models, not production services.
package platformpath

import (
	"errors"
	"math"
	"strings"
	"sync"
)

var ErrInvalid = errors.New("invalid request")
var ErrConflict = errors.New("request ID reused with different parameters")

type RewardRequest struct {
	Namespace string `json:"namespace"`
	User      string `json:"user"`
	RequestID string `json:"request_id"`
	Amount    int64  `json:"amount"`
}

func (r RewardRequest) Validate() error {
	if strings.TrimSpace(r.Namespace) == "" || strings.TrimSpace(r.User) == "" || strings.TrimSpace(r.RequestID) == "" || r.Amount <= 0 {
		return ErrInvalid
	}
	return nil
}

type Result struct {
	Balance   int64  `json:"balance"`
	EventID   uint64 `json:"event_id"`
	Duplicate bool   `json:"duplicate"`
}
type Event struct {
	ID              uint64
	Namespace, User string
	Amount          int64
	Sent            bool
}
type accountKey struct{ namespace, user string }
type requestKey struct{ namespace, id string }
type receipt struct {
	request RewardRequest
	result  Result
}
type Ledger struct {
	mu       sync.Mutex
	balances map[accountKey]int64
	receipts map[requestKey]receipt
	events   []Event
}

func NewLedger() *Ledger {
	return &Ledger{balances: make(map[accountKey]int64), receipts: make(map[requestKey]receipt)}
}

// Grant protects read/check/write as one operation. All state is process-local.
// A duplicate returns the original receipt, not the account's current balance.
func (l *Ledger) Grant(r RewardRequest) (Result, error) {
	if err := r.Validate(); err != nil {
		return Result{}, err
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	k := requestKey{r.Namespace, r.RequestID}
	if saved, ok := l.receipts[k]; ok {
		if saved.request != r {
			return Result{}, ErrConflict
		}
		result := saved.result
		result.Duplicate = true
		return result, nil
	}
	account := accountKey{r.Namespace, r.User}
	old := l.balances[account]
	if r.Amount > math.MaxInt64-old {
		return Result{}, ErrInvalid
	}
	result := Result{Balance: old + r.Amount, EventID: uint64(len(l.events) + 1)}
	l.balances[account] = result.Balance
	l.receipts[k] = receipt{r, result}
	l.events = append(l.events, Event{result.EventID, r.Namespace, r.User, r.Amount, false})
	return result, nil
}
func (l *Ledger) Balance(namespace, user string) int64 {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.balances[accountKey{namespace, user}]
}

// Pending copies value-only events to keep callers from mutating internal state.
func (l *Ledger) Pending() []Event {
	l.mu.Lock()
	defer l.mu.Unlock()
	var result []Event
	for _, e := range l.events {
		if !e.Sent {
			result = append(result, e)
		}
	}
	return result
}
func (l *Ledger) MarkSent(id uint64) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if id == 0 || id > uint64(len(l.events)) {
		return false
	}
	l.events[id-1].Sent = true
	return true
}

// Sink's effects and deduplication record share one lock. Both vanish on restart.
// It models a single producer with globally unique IDs for that producer's life.
type Sink struct {
	mu      sync.Mutex
	seen    map[uint64]Event
	effects int
}

func NewSink() *Sink { return &Sink{seen: make(map[uint64]Event)} }
func (s *Sink) Apply(e Event) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e.Sent = false
	if previous, ok := s.seen[e.ID]; ok {
		if previous != e {
			return false, ErrConflict
		}
		return false, nil
	}
	s.seen[e.ID] = e
	s.effects++
	return true, nil
}
func (s *Sink) Effects() int { s.mu.Lock(); defer s.mu.Unlock(); return s.effects }

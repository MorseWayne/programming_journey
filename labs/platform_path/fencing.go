package platformpath

import (
	"errors"
	"sync"
)

var ErrStale = errors.New("stale fencing token")

// This model installs the new epoch atomically at the receiving store.
// It is not a distributed lock service or a consensus implementation.
type FencedStore struct {
	mu     sync.Mutex
	epoch  map[string]uint64
	values map[string]string
}

func NewFencedStore() *FencedStore {
	return &FencedStore{epoch: make(map[string]uint64), values: make(map[string]string)}
}
func (s *FencedStore) Activate(key string) uint64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.epoch[key]++
	return s.epoch[key]
}
func (s *FencedStore) Write(key string, token uint64, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if token == 0 || token != s.epoch[key] {
		return ErrStale
	}
	s.values[key] = value
	return nil
}
func (s *FencedStore) Read(key string) string { s.mu.Lock(); defer s.mu.Unlock(); return s.values[key] }

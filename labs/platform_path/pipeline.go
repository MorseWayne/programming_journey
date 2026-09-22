package platformpath

import (
	"context"
	"errors"
	"sync"
)

// Run executes a finite batch. fn must cooperate with cancellation.
// capacity bounds queued IDs, not jobs' source slice or fn's allocations.
func Run(ctx context.Context, workers, capacity int, jobs []int, fn func(context.Context, int) error) error {
	if workers < 1 || capacity < 0 || fn == nil {
		return errors.New("invalid worker configuration")
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	queue := make(chan int, capacity)
	var wg sync.WaitGroup
	var once sync.Once
	var firstError error
	wg.Add(1)
	go func() {
		defer wg.Done()
		defer close(queue)
		for _, job := range jobs {
			select {
			case <-ctx.Done():
				return
			case queue <- job:
			}
		}
	}()
	wg.Add(workers)
	for i := 0; i < workers; i++ {
		go func() {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case job, ok := <-queue:
					if !ok || ctx.Err() != nil {
						return
					}
					if err := fn(ctx, job); err != nil {
						once.Do(func() { firstError = err; cancel() })
						return
					}
				}
			}
		}()
	}
	wg.Wait()
	if firstError != nil {
		return firstError
	}
	return ctx.Err()
}

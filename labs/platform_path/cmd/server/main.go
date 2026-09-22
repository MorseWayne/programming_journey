package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	lab "programmingjourney/platformpath"
	"syscall"
	"time"
)

func main() {
	address := os.Getenv("ARENA_ADDRESS")
	if address == "" {
		address = "127.0.0.1:8097"
	}
	api := lab.NewAPI(lab.NewLedger())
	s := &http.Server{Addr: address, Handler: api.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 30 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	result := make(chan error, 1)
	go func() {
		log.Printf("arena teaching server: %s (in-memory state)", address)
		result <- s.ListenAndServe()
	}()
	select {
	case err := <-result:
		if !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
		return
	case <-ctx.Done():
	}
	api.Drain()
	shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := s.Shutdown(shutdown); err != nil {
		log.Printf("shutdown: %v", err)
		_ = s.Close()
	}
}

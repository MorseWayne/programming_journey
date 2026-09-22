package main

import (
	"fmt"
	"log"

	"programmingjourney/platformpath/foundations"
)

func main() {
	var account foundations.Account
	fmt.Println("initial:", account.Balance())
	if err := account.Credit(10); err != nil {
		log.Fatal(err)
	}
	fmt.Println("after credit:", account.Balance())
	var replacement foundations.Account
	fmt.Println("new account:", replacement.Balance())

	events := []string{"u1", "u2"}
	view := events
	view[0] = "u9"
	fmt.Println("shared slice:", events)

	// A deterministic interleaving model, not a real concurrent execution.
	// Individual reads/writes can be safe while their composition loses an update.
	balance := 0
	aRead, bRead := balance, balance
	balance = aRead + 10
	balance = bRead + 10
	fmt.Printf("interleaved read-modify-write: %d (two awards should total 20)\n", balance)
}

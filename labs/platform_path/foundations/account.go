// Package foundations isolates the sequential model used before concurrency,
// request receipts and persistence are introduced in the course.
package foundations

import (
	"errors"
	"math"
)

var ErrAmount = errors.New("amount must be positive and fit the remaining balance range")

// Account's zero value is ready to use. It is a single-process, sequential model.
// Calling Credit twice means two separate awards; it does not deduplicate requests.
type Account struct {
	balance int64
}

func (a *Account) Balance() int64 { return a.balance }

func (a *Account) Credit(amount int64) error {
	if amount <= 0 || amount > math.MaxInt64-a.balance {
		return ErrAmount
	}
	a.balance += amount
	return nil
}

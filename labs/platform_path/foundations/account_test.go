package foundations

import (
	"errors"
	"math"
	"testing"
)

func TestCreditContract(t *testing.T) {
	var a Account
	for _, amount := range []int64{10, 7} {
		if err := a.Credit(amount); err != nil {
			t.Fatal(err)
		}
	}
	if got := a.Balance(); got != 17 {
		t.Fatalf("two separate awards: got %d, want 17", got)
	}
	for _, amount := range []int64{0, -1, math.MaxInt64} {
		before := a.Balance()
		if err := a.Credit(amount); !errors.Is(err, ErrAmount) {
			t.Fatalf("amount %d: got error %v", amount, err)
		}
		if a.Balance() != before {
			t.Fatal("a rejected operation changed the balance")
		}
	}
}

func TestAccountCopy(t *testing.T) {
	var original Account
	if err := original.Credit(10); err != nil {
		t.Fatal(err)
	}
	copy := original
	if err := copy.Credit(7); err != nil {
		t.Fatal(err)
	}
	if original.Balance() != 10 || copy.Balance() != 17 {
		t.Fatal("accounts with value-only fields should be independent after assignment")
	}
}

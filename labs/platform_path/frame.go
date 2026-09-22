package platformpath

import (
	"encoding/binary"
	"errors"
	"io"
)

const MaxFrame = 64 * 1024

// Actual sockets also need deadlines and per-connection resource budgets.
func ReadFrame(r io.Reader) ([]byte, error) {
	var header [4]byte
	if _, err := io.ReadFull(r, header[:]); err != nil {
		return nil, err
	}
	size := binary.BigEndian.Uint32(header[:])
	if size > MaxFrame {
		return nil, errors.New("frame exceeds maximum length")
	}
	body := make([]byte, int(size))
	if _, err := io.ReadFull(r, body); err != nil {
		return nil, err
	}
	return body, nil
}

package main

import (
	"encoding/json"
	"math"
	"os"
	"sort"
)

func main() {
	samples := make([]float64, 0, 1000)
	for i := 0; i < 990; i++ {
		samples = append(samples, 5)
	}
	for i := 0; i < 9; i++ {
		samples = append(samples, 500)
	}
	samples = append(samples, 5000)
	sort.Float64s(samples)
	sum := 0.0
	good := 0
	for _, v := range samples {
		sum += v
		if v <= 100 {
			good++
		}
	}
	result := map[string]any{"sample_kind": "synthetic", "count": len(samples), "mean_ms": sum / float64(len(samples)), "p99_ms": samples[int(math.Ceil(.99*float64(len(samples))))-1], "max_ms": samples[len(samples)-1], "under_100ms_fraction": float64(good) / float64(len(samples))}
	e := json.NewEncoder(os.Stdout)
	e.SetIndent("", "  ")
	_ = e.Encode(result)
}

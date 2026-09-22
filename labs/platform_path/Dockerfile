FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY *.go ./
COPY cmd ./cmd
RUN CGO_ENABLED=0 go build -o /arena ./cmd/server
FROM alpine:3.22
RUN adduser -D -u 10001 learner
USER learner
COPY --from=build /arena /arena
ENV ARENA_ADDRESS=0.0.0.0:8097
EXPOSE 8097
ENTRYPOINT ["/arena"]

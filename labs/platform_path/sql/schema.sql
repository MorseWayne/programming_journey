-- Synthetic course database only. Re-running keeps existing learner data.
CREATE DATABASE IF NOT EXISTS journey_lab;
USE journey_lab;
CREATE TABLE IF NOT EXISTS wallets (
  ns VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  uid VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  balance BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (ns, uid),
  CHECK (balance >= 0)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS receipts (
  ns VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  uid VARCHAR(64) NOT NULL,
  amount BIGINT NOT NULL,
  state VARCHAR(16) NOT NULL,
  result_balance BIGINT,
  PRIMARY KEY (ns, request_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS outbox (
  event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ns VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  uid VARCHAR(64) NOT NULL,
  amount BIGINT NOT NULL,
  sent BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (event_id),
  UNIQUE KEY uq_request (ns, request_id),
  KEY ix_pending (sent, event_id)
) ENGINE=InnoDB;
INSERT IGNORE INTO wallets(ns,uid,balance) VALUES ('game-a','u1',100),('game-b','u1',100);

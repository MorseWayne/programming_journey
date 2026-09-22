USE journey_lab;
DROP PROCEDURE IF EXISTS grant_reward;
DELIMITER //
CREATE PROCEDURE grant_reward(
 IN p_ns VARCHAR(64), IN p_uid VARCHAR(64),
 IN p_request_id VARCHAR(64), IN p_amount BIGINT
)
main: BEGIN
 DECLARE v_uid VARCHAR(64);
 DECLARE v_amount BIGINT;
 DECLARE v_state VARCHAR(16);
 DECLARE v_balance BIGINT;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
 IF p_ns IS NULL OR TRIM(p_ns)='' OR p_uid IS NULL OR TRIM(p_uid)=''
    OR p_request_id IS NULL OR TRIM(p_request_id)=''
    OR p_amount IS NULL OR p_amount <= 0 THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='invalid request';
 END IF;
 START TRANSACTION;
 INSERT INTO receipts(ns,request_id,uid,amount,state)
 VALUES (p_ns,p_request_id,p_uid,p_amount,'pending')
 ON DUPLICATE KEY UPDATE request_id=receipts.request_id;
 SELECT uid,amount,state,result_balance
 INTO v_uid,v_amount,v_state,v_balance
 FROM receipts WHERE ns=p_ns AND request_id=p_request_id FOR UPDATE;
 IF BINARY v_uid <> BINARY p_uid OR v_amount<>p_amount THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='idempotency conflict';
 END IF;
 IF v_state='complete' THEN
   COMMIT;
   SELECT v_balance AS balance, TRUE AS duplicate;
   LEAVE main;
 END IF;
 INSERT INTO wallets(ns,uid,balance) VALUES(p_ns,p_uid,0)
 ON DUPLICATE KEY UPDATE uid=wallets.uid;
 UPDATE wallets SET balance=balance+p_amount WHERE ns=p_ns AND uid=p_uid;
 SELECT balance INTO v_balance FROM wallets WHERE ns=p_ns AND uid=p_uid;
 INSERT INTO outbox(ns,request_id,uid,amount) VALUES(p_ns,p_request_id,p_uid,p_amount);
 UPDATE receipts SET state='complete',result_balance=v_balance
 WHERE ns=p_ns AND request_id=p_request_id;
 COMMIT;
 SELECT v_balance AS balance, FALSE AS duplicate;
END//
DELIMITER ;

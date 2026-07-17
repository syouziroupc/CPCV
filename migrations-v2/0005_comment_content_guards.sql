CREATE TRIGGER trg_comments_content_guard_insert
BEFORE INSERT ON comments
WHEN length(NEW.message) NOT BETWEEN 1 AND 140
  OR NEW.message_length <> length(NEW.message)
  OR length(NEW.nickname) > 20
BEGIN
  SELECT RAISE(ABORT, 'comment content constraint');
END;

CREATE TRIGGER trg_comments_content_guard_update
BEFORE UPDATE OF message, message_length, nickname ON comments
WHEN length(NEW.message) NOT BETWEEN 1 AND 140
  OR NEW.message_length <> length(NEW.message)
  OR length(NEW.nickname) > 20
BEGIN
  SELECT RAISE(ABORT, 'comment content constraint');
END;

PRAGMA optimize;

ALTER TABLE assessment_library ADD COLUMN active boolean NOT NULL DEFAULT true;

CREATE TABLE assessment_library_history (
    revision uuid PRIMARY KEY,
    name text NOT NULL,
    data jsonb NOT NULL,
    active boolean NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO assessment_library_history(revision,name,data,active)
SELECT revision,name,data,active FROM assessment_library;
CREATE FUNCTION record_assessment_library_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO assessment_library_history(revision,name,data,active)
    VALUES(NEW.revision,NEW.name,NEW.data,NEW.active);
    RETURN NEW;
END;
$$;
CREATE TRIGGER retain_assessment_library_change AFTER INSERT OR UPDATE ON assessment_library
FOR EACH ROW EXECUTE FUNCTION record_assessment_library_change();

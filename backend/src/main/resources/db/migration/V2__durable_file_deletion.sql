CREATE TABLE file_deletion_queue (
    id uuid PRIMARY KEY,
    enqueued_at timestamptz NOT NULL DEFAULT now()
);

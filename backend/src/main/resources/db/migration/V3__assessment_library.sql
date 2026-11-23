CREATE TABLE assessment_library (
    name text PRIMARY KEY,
    revision uuid NOT NULL,
    data jsonb NOT NULL
);

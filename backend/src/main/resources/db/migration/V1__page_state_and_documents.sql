CREATE TABLE page_state (
    page varchar(40) PRIMARY KEY,
    state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(state) = 'object'),
    revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE page_state_history (
    page varchar(40) NOT NULL REFERENCES page_state(page),
    revision bigint NOT NULL,
    state jsonb NOT NULL,
    saved_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (page, revision)
);
CREATE TABLE page_reference (
    page varchar(40) PRIMARY KEY REFERENCES page_state(page),
    data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object')
);
CREATE TABLE documents (
    id uuid PRIMARY KEY,
    scope varchar(120) NOT NULL,
    title varchar(200) NOT NULL,
    filename varchar(255) NOT NULL,
    content_type varchar(150) NOT NULL,
    size bigint NOT NULL CHECK (size > 0 AND size <= 26214400),
    sha256 char(64) NOT NULL,
    category varchar(100) NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_scope_created_idx ON documents(scope, created_at DESC);

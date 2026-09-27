DO $do$
DECLARE
    r RECORD;
    max_id BIGINT;
BEGIN
    FOR r IN
        SELECT
            tc.table_name,
            c.column_name,
            pg_get_serial_sequence(tc.table_name, c.column_name) AS seq_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
            AND tc.table_schema = ccu.table_schema
        JOIN information_schema.columns c
            ON c.table_name = tc.table_name
            AND c.column_name = ccu.column_name
            AND c.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = 'public'
          AND pg_get_serial_sequence(tc.table_name, c.column_name) IS NOT NULL
    LOOP
        EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I', r.column_name, r.table_name) INTO max_id;
        IF max_id > 0 THEN
            EXECUTE format('SELECT setval(%L, %s, true)', r.seq_name, max_id);
            RAISE NOTICE 'Updated sequence % for table %.% to %', r.seq_name, r.table_name, r.column_name, max_id;
        END IF;
    END LOOP;
END $do$;

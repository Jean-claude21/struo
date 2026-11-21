-- Demo copies remember the version of the application that made them: after a deploy, the copies
-- still waiting for a visitor that an older version made are dropped and made again, so a visitor
-- never opens yesterday's demo. Copies already given to a visitor stay until they expire.
alter table demo_sandbox add column version text;

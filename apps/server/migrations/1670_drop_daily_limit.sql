-- A drop's daily limit grows with the plan, up to 5000 (DROP_DAILY_LIMIT_MAX).
alter table drops drop constraint drops_daily_limit_check;
alter table drops add constraint drops_daily_limit_check check (daily_limit between 1 and 5000);

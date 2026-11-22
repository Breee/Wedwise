-- Command-line access now lasts one day instead of ninety. Access granted
-- under the old rule is withdrawn; `wedwise login` grants it again.
DELETE FROM device_tokens WHERE token_hash <> '';

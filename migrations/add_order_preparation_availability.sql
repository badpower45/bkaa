-- Add out-of-stock tracking and substitution preference for preparation items
ALTER TABLE order_preparation_items
    ADD COLUMN IF NOT EXISTS is_out_of_stock BOOLEAN DEFAULT FALSE;

ALTER TABLE order_preparation_items
    ADD COLUMN IF NOT EXISTS substitution_preference TEXT;

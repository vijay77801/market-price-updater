import express from "express";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 10000;

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(express.json());


// Home
app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "Market Price Updater",
        supabase: "connected"
    });
});


// Test Supabase
app.get("/test-supabase", async (req, res) => {

    try {

        const { data, error } = await supabase
            .from("market_products")
            .select("id, product_name, current_price")
            .limit(10);

        if (error) {
            throw error;
        }

        res.json({
            success: true,
            products: data
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


app.listen(PORT, () => {

    console.log(
        `Market Price Updater running on port ${PORT}`
    );

});

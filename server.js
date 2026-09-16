import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 10000;

app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "Market Price Updater"
    });
});

app.get("/health", (req, res) => {
    res.json({
        ok: true,
        message: "Backend is working"
    });
});

app.listen(PORT, () => {
    console.log(
        `Market Price Updater running on port ${PORT}`
    );
});
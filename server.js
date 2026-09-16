import express from "express";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

const MARKET_API_KEY =
    process.env.MARKET_API_KEY;

const RESOURCE_ID =
    "9ef84268-d588-465a-a308-a864a43d0070";

const DATA_GOV_URL =
    `https://api.data.gov.in/resource/${RESOURCE_ID}`;

const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
);


/* =========================================================
   HOME
========================================================= */

app.get("/", (req, res) => {

    res.json({
        status: "online",
        service: "Market Price Updater",
        supabase: "connected",
        marketApi: MARKET_API_KEY ? "configured" : "missing"
    });

});


/* =========================================================
   TEST SUPABASE
========================================================= */

app.get("/test-supabase", async (req, res) => {

    try {

        const { data, error } = await supabase
            .from("market_products")
            .select("*")
            .limit(10);

        if (error) throw error;

        res.json({
            success: true,
            products: data
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            error: error.message
        });

    }

});


/* =========================================================
   TEST DATA.GOV.IN API

   Open:
   /test-market-api
========================================================= */

app.get("/test-market-api", async (req, res) => {

    try {

        const url =
            `${DATA_GOV_URL}` +
            `?api-key=${encodeURIComponent(MARKET_API_KEY)}` +
            `&format=json` +
            `&offset=0` +
            `&limit=10`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(
                `Market API HTTP ${response.status}`
            );
        }

        const data = await response.json();

        res.json({
            success: true,
            total: data.total ?? null,
            count: data.count ?? data.records?.length ?? 0,
            records: data.records || []
        });

    } catch (error) {

        console.error("Market API error:", error);

        res.status(500).json({
            success: false,
            error: error.message
        });

    }

});


/* =========================================================
   CONVERT VALUE TO NUMBER
========================================================= */

function numberValue(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return 0;
    }

    const cleaned = String(value)
        .replace(/,/g, "")
        .replace(/[^\d.-]/g, "");

    const n = Number(cleaned);

    return Number.isFinite(n) ? n : 0;
}


/* =========================================================
   NORMALIZE FIELD NAMES

   This makes the importer tolerant of common OGD field
   naming variations.
========================================================= */

function getField(record, names) {

    for (const name of names) {

        if (
            record[name] !== undefined &&
            record[name] !== null
        ) {
            return record[name];
        }

    }

    return "";
}


function normalizeRecord(record) {

    const commodity = getField(record, [
        "commodity",
        "Commodity",
        "commodity_name",
        "Commodity_Name"
    ]);

    const variety = getField(record, [
        "variety",
        "Variety"
    ]);

    const market = getField(record, [
        "market",
        "Market"
    ]);

    const state = getField(record, [
        "state",
        "State"
    ]);

    const district = getField(record, [
        "district",
        "District"
    ]);

    const arrivalDate = getField(record, [
        "arrival_date",
        "Arrival_Date",
        "date",
        "Date"
    ]);

    const modalPrice = numberValue(
        getField(record, [
            "modal_price",
            "Modal_Price",
            "modalprice",
            "Modal Price"
        ])
    );

    const minPrice = numberValue(
        getField(record, [
            "min_price",
            "Min_Price",
            "minprice",
            "Min Price"
        ])
    );

    const maxPrice = numberValue(
        getField(record, [
            "max_price",
            "Max_Price",
            "maxprice",
            "Max Price"
        ])
    );

    return {
        commodity: String(commodity || "").trim(),
        variety: String(variety || "").trim(),
        market: String(market || "").trim(),
        state: String(state || "").trim(),
        district: String(district || "").trim(),
        arrivalDate: String(arrivalDate || "").trim(),
        modalPrice,
        minPrice,
        maxPrice
    };

}


/* =========================================================
   FETCH ONE PAGE FROM DATA.GOV.IN
========================================================= */

async function fetchMarketPage(offset, limit) {

    const url =
        `${DATA_GOV_URL}` +
        `?api-key=${encodeURIComponent(MARKET_API_KEY)}` +
        `&format=json` +
        `&offset=${offset}` +
        `&limit=${limit}`;

    const response = await fetch(url);

    if (!response.ok) {

        throw new Error(
            `Market API HTTP ${response.status}`
        );

    }

    return await response.json();
}


/* =========================================================
   UPDATE ONE PRODUCT

   Mandi prices are commonly quoted per quintal.
   We preserve the source unit as quintal here instead of
   pretending it is a retail per-kg price.
========================================================= */

async function saveMarketRecord(item) {

    if (!item.commodity) {
        return {
            status: "skipped"
        };
    }

    if (!item.modalPrice) {
        return {
            status: "skipped"
        };
    }


    /*
       A commodity can appear in many markets.
       We keep market/state/district in the identity lookup.
    */

    let query = supabase
        .from("market_products")
        .select("id,current_price")
        .eq("product_name", item.commodity)
        .eq("market", item.market || "")
        .eq("state", item.state || "")
        .eq("district", item.district || "")
        .limit(1);

    const {
        data: existingRows,
        error: findError
    } = await query;

    if (findError) {
        throw findError;
    }

    const existing =
        existingRows?.[0] || null;


    if (existing) {

        const oldCurrent =
            numberValue(existing.current_price);

        const { error } = await supabase
            .from("market_products")
            .update({
                previous_price:
                    oldCurrent || item.modalPrice,

                current_price:
                    item.modalPrice,

                min_price:
                    item.minPrice,

                max_price:
                    item.maxPrice,

                unit:
                    "quintal",

                source:
                    "data.gov.in Mandi",

                source_date:
                    parseSourceDate(item.arrivalDate),

                updated_at:
                    new Date().toISOString()
            })
            .eq("id", existing.id);

        if (error) throw error;

        return {
            status: "updated"
        };

    }


    const { error } = await supabase
        .from("market_products")
        .insert({
            product_name:
                item.commodity,

            category:
                "Mandi Commodity",

            market:
                item.market,

            state:
                item.state,

            district:
                item.district,

            unit:
                "quintal",

            previous_price:
                item.modalPrice,

            current_price:
                item.modalPrice,

            min_price:
                item.minPrice,

            max_price:
                item.maxPrice,

            source:
                "data.gov.in Mandi",

            source_date:
                parseSourceDate(item.arrivalDate),

            updated_at:
                new Date().toISOString()
        });

    if (error) throw error;

    return {
        status: "inserted"
    };

}


/* =========================================================
   DATE CONVERTER
========================================================= */

function parseSourceDate(value) {

    if (!value) return null;

    const text = String(value).trim();


    // DD/MM/YYYY
    const slash =
        text.match(
            /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
        );

    if (slash) {

        const [, dd, mm, yyyy] = slash;

        return (
            `${yyyy}-` +
            `${String(mm).padStart(2, "0")}-` +
            `${String(dd).padStart(2, "0")}`
        );

    }


    // DD-MM-YYYY
    const dash =
        text.match(
            /^(\d{1,2})-(\d{1,2})-(\d{4})$/
        );

    if (dash) {

        const [, dd, mm, yyyy] = dash;

        return (
            `${yyyy}-` +
            `${String(mm).padStart(2, "0")}-` +
            `${String(dd).padStart(2, "0")}`
        );

    }


    // Already YYYY-MM-DD
    if (
        /^\d{4}-\d{2}-\d{2}$/.test(text)
    ) {
        return text;
    }

    return null;
}


/* =========================================================
   IMPORT MARKET DATA

   First use:
   /update-market?limit=100

   Later:
   /update-market?limit=1000
========================================================= */

app.get("/update-market", async (req, res) => {

    try {

        if (!MARKET_API_KEY) {

            return res.status(500).json({
                success: false,
                error:
                    "MARKET_API_KEY is not configured"
            });

        }


        let requestedLimit =
            Number(req.query.limit || 100);

        if (
            !Number.isFinite(requestedLimit) ||
            requestedLimit < 1
        ) {
            requestedLimit = 100;
        }

        /*
          Keep manual test runs controlled.
          We can increase this after confirming the API.
        */

        requestedLimit =
            Math.min(requestedLimit, 10000);


        const pageSize =
            Math.min(requestedLimit, 1000);

        let offset = 0;

        let processed = 0;
        let inserted = 0;
        let updated = 0;
        let skipped = 0;

        let totalAvailable = null;


        while (processed < requestedLimit) {

            const remaining =
                requestedLimit - processed;

            const limit =
                Math.min(pageSize, remaining);

            const apiData =
                await fetchMarketPage(
                    offset,
                    limit
                );


            if (totalAvailable === null) {

                totalAvailable =
                    Number(
                        apiData.total ??
                        apiData.totalRecords ??
                        0
                    ) || null;

            }


            const records =
                Array.isArray(apiData.records)
                    ? apiData.records
                    : [];


            if (!records.length) {
                break;
            }


            for (const rawRecord of records) {

                const item =
                    normalizeRecord(rawRecord);

                try {

                    const result =
                        await saveMarketRecord(item);

                    if (
                        result.status ===
                        "inserted"
                    ) {
                        inserted++;
                    }

                    else if (
                        result.status ===
                        "updated"
                    ) {
                        updated++;
                    }

                    else {
                        skipped++;
                    }

                } catch (recordError) {

                    skipped++;

                    console.error(
                        "Record failed:",
                        item,
                        recordError.message
                    );

                }

                processed++;

                if (
                    processed >=
                    requestedLimit
                ) {
                    break;
                }

            }


            offset += records.length;


            if (records.length < limit) {
                break;
            }

        }


        res.json({
            success: true,
            message:
                "Market data import completed",

            apiTotal:
                totalAvailable,

            processed,
            inserted,
            updated,
            skipped
        });


    } catch (error) {

        console.error(
            "Market update failed:",
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });

    }

});


/* =========================================================
   START SERVER
========================================================= */

app.listen(PORT, () => {

    console.log(
        `Market Price Updater running on port ${PORT}`
    );

});

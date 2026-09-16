import express from "express";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

/* =========================================================
   ENVIRONMENT VARIABLES
========================================================= */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

const MARKET_API_KEY =
    process.env.MARKET_API_KEY;


/* =========================================================
   DATA.GOV.IN MANDI API
========================================================= */

const RESOURCE_ID =
    "9ef84268-d588-465a-a308-a864a43d0070";

const DATA_GOV_URL =
    `https://api.data.gov.in/resource/${RESOURCE_ID}`;


/* =========================================================
   SUPABASE
========================================================= */

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
        supabase:
            SUPABASE_URL &&
            SUPABASE_SERVICE_ROLE_KEY
                ? "configured"
                : "missing",

        marketApi:
            MARKET_API_KEY
                ? "configured"
                : "missing"
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

        if (error) {
            throw error;
        }

        res.json({
            success: true,
            count: data?.length || 0,
            products: data || []
        });

    } catch (error) {

        console.error(
            "SUPABASE_TEST_ERROR:",
            error?.message || String(error)
        );

        res.status(500).json({
            success: false,
            error:
                error?.message ||
                String(error)
        });

    }

});


/* =========================================================
   TEST MARKET API
========================================================= */

app.get("/test-market-api", async (req, res) => {

    try {

        if (!MARKET_API_KEY) {

            return res.status(500).json({
                success: false,
                error:
                    "MARKET_API_KEY is missing"
            });

        }

        const url =
            `${DATA_GOV_URL}` +
            `?api-key=${encodeURIComponent(MARKET_API_KEY)}` +
            `&format=json` +
            `&offset=0` +
            `&limit=10`;

        const response =
            await fetch(url);

        if (!response.ok) {

            throw new Error(
                `Market API HTTP ${response.status}`
            );

        }

        const data =
            await response.json();

        res.json({
            success: true,
            total:
                data.total ?? null,
            count:
                data.count ??
                data.records?.length ??
                0,
            records:
                data.records || []
        });

    } catch (error) {

        console.error(
            "MARKET_API_ERROR:",
            error?.message ||
            String(error)
        );

        res.status(500).json({
            success: false,
            error:
                error?.message ||
                String(error)
        });

    }

});


/* =========================================================
   NUMBER CONVERTER
========================================================= */

function numberValue(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return 0;
    }

    const cleaned =
        String(value)
            .replace(/,/g, "")
            .replace(/[^\d.-]/g, "");

    const number =
        Number(cleaned);

    return Number.isFinite(number)
        ? number
        : 0;
}


/* =========================================================
   GET FIELD
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


/* =========================================================
   NORMALIZE API RECORD
========================================================= */

function normalizeRecord(record) {

    const commodity =
        getField(record, [
            "commodity",
            "Commodity",
            "commodity_name",
            "Commodity_Name"
        ]);

    const variety =
        getField(record, [
            "variety",
            "Variety"
        ]);

    const market =
        getField(record, [
            "market",
            "Market"
        ]);

    const state =
        getField(record, [
            "state",
            "State"
        ]);

    const district =
        getField(record, [
            "district",
            "District"
        ]);

    const arrivalDate =
        getField(record, [
            "arrival_date",
            "Arrival_Date",
            "date",
            "Date"
        ]);

    const modalPrice =
        numberValue(
            getField(record, [
                "modal_price",
                "Modal_Price",
                "modalprice",
                "Modal Price"
            ])
        );

    const minPrice =
        numberValue(
            getField(record, [
                "min_price",
                "Min_Price",
                "minprice",
                "Min Price"
            ])
        );

    const maxPrice =
        numberValue(
            getField(record, [
                "max_price",
                "Max_Price",
                "maxprice",
                "Max Price"
            ])
        );

    return {

        commodity:
            String(commodity || "")
                .trim(),

        variety:
            String(variety || "")
                .trim(),

        market:
            String(market || "")
                .trim(),

        state:
            String(state || "")
                .trim(),

        district:
            String(district || "")
                .trim(),

        arrivalDate:
            String(arrivalDate || "")
                .trim(),

        modalPrice,
        minPrice,
        maxPrice
    };
}


/* =========================================================
   DATE CONVERTER
========================================================= */

function parseSourceDate(value) {

    if (!value) {
        return null;
    }

    const text =
        String(value).trim();


    // Example: 16/09/2026

    const slashMatch =
        text.match(
            /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
        );

    if (slashMatch) {

        const [
            ,
            day,
            month,
            year
        ] = slashMatch;

        return (
            `${year}-` +
            `${String(month).padStart(2, "0")}-` +
            `${String(day).padStart(2, "0")}`
        );

    }


    // Example: 16-09-2026

    const dashMatch =
        text.match(
            /^(\d{1,2})-(\d{1,2})-(\d{4})$/
        );

    if (dashMatch) {

        const [
            ,
            day,
            month,
            year
        ] = dashMatch;

        return (
            `${year}-` +
            `${String(month).padStart(2, "0")}-` +
            `${String(day).padStart(2, "0")}`
        );

    }


    // Example: 2026-09-16

    if (
        /^\d{4}-\d{2}-\d{2}$/.test(text)
    ) {
        return text;
    }


    return null;
}


/* =========================================================
   FETCH MARKET PAGE
========================================================= */

async function fetchMarketPage(
    offset,
    limit
) {

    const url =
        `${DATA_GOV_URL}` +
        `?api-key=${encodeURIComponent(MARKET_API_KEY)}` +
        `&format=json` +
        `&offset=${offset}` +
        `&limit=${limit}`;

    const response =
        await fetch(url);

    if (!response.ok) {

        throw new Error(
            `Market API HTTP ${response.status}`
        );

    }

    return await response.json();
}


/* =========================================================
   SAVE ONE MARKET RECORD
========================================================= */

async function saveMarketRecord(item) {

    if (!item.commodity) {

        return {
            status: "skipped",
            reason: "commodity missing"
        };

    }

    if (!item.modalPrice) {

        return {
            status: "skipped",
            reason: "modal price missing"
        };

    }


    /* -----------------------------------------------------
       CHECK EXISTING PRODUCT
    ----------------------------------------------------- */

    const {
        data: existingRows,
        error: findError
    } = await supabase
        .from("market_products")
        .select(
            "id,current_price"
        )
        .eq(
            "product_name",
            item.commodity
        )
        .eq(
            "market",
            item.market
        )
        .eq(
            "state",
            item.state
        )
        .eq(
            "district",
            item.district
        )
        .limit(1);


    if (findError) {

        console.error(
            "DB_ERROR:",
            findError.message
        );

        throw new Error(
            findError.message
        );

    }


    const existing =
        existingRows?.[0] || null;


    /* -----------------------------------------------------
       UPDATE EXISTING
    ----------------------------------------------------- */

    if (existing) {

        const oldCurrentPrice =
            numberValue(
                existing.current_price
            );

        const {
            error: updateError
        } = await supabase
            .from("market_products")
            .update({

                previous_price:
                    oldCurrentPrice ||
                    item.modalPrice,

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
                    parseSourceDate(
                        item.arrivalDate
                    ),

                updated_at:
                    new Date()
                        .toISOString()

            })
            .eq(
                "id",
                existing.id
            );


        if (updateError) {

            console.error(
                "DB_ERROR:",
                updateError.message
            );

            throw new Error(
                updateError.message
            );

        }


        return {
            status: "updated"
        };

    }


    /* -----------------------------------------------------
       INSERT NEW PRODUCT
    ----------------------------------------------------- */

    const {
        error: insertError
    } = await supabase
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
                parseSourceDate(
                    item.arrivalDate
                ),

            updated_at:
                new Date()
                    .toISOString()

        });


    if (insertError) {

        console.error(
            "DB_ERROR:",
            insertError.message
        );

        throw new Error(
            insertError.message
        );

    }


    return {
        status: "inserted"
    };
}


/* =========================================================
   UPDATE / IMPORT MARKET DATA
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
            Number(
                req.query.limit || 1
            );


        if (
            !Number.isFinite(
                requestedLimit
            ) ||
            requestedLimit < 1
        ) {

            requestedLimit = 1;

        }


        requestedLimit =
            Math.min(
                requestedLimit,
                10000
            );


        const pageSize =
            Math.min(
                requestedLimit,
                1000
            );


        let offset = 0;

        let processed = 0;

        let inserted = 0;

        let updated = 0;

        let skipped = 0;

        let totalAvailable =
            null;

        const errors = [];


        while (
            processed <
            requestedLimit
        ) {

            const remaining =
                requestedLimit -
                processed;

            const limit =
                Math.min(
                    pageSize,
                    remaining
                );


            const apiData =
                await fetchMarketPage(
                    offset,
                    limit
                );


            if (
                totalAvailable ===
                null
            ) {

                totalAvailable =
                    Number(
                        apiData.total ??
                        apiData.totalRecords ??
                        0
                    ) || null;

            }


            const records =
                Array.isArray(
                    apiData.records
                )
                    ? apiData.records
                    : [];


            if (
                records.length === 0
            ) {
                break;
            }


            for (
                const rawRecord
                of records
            ) {

                const item =
                    normalizeRecord(
                        rawRecord
                    );


                try {

                    const result =
                        await saveMarketRecord(
                            item
                        );


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

                } catch (error) {

                    skipped++;


                    const errorMessage =
                        error?.message ||
                        String(error);


                    console.error(
                        "DB_ERROR:",
                        errorMessage
                    );


                    if (
                        errors.length < 10
                    ) {

                        errors.push({

                            commodity:
                                item.commodity,

                            market:
                                item.market,

                            state:
                                item.state,

                            error:
                                errorMessage

                        });

                    }

                }


                processed++;


                if (
                    processed >=
                    requestedLimit
                ) {
                    break;
                }

            }


            offset +=
                records.length;


            if (
                records.length <
                limit
            ) {
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

            skipped,

            errors

        });


    } catch (error) {

        const errorMessage =
            error?.message ||
            String(error);


        console.error(
            "UPDATE_ERROR:",
            errorMessage
        );


        res.status(500).json({

            success: false,

            error:
                errorMessage

        });

    }

});


/* =========================================================
   SERVER START
========================================================= */

app.listen(PORT, () => {

    console.log(
        `Market Price Updater running on port ${PORT}`
    );

});

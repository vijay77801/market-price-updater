import express from "express";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

/* =========================================================
   ENV VARIABLES
========================================================= */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

const MARKET_API_KEY =
    process.env.MARKET_API_KEY;

if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !MARKET_API_KEY
) {
    console.error("Required environment variables are missing");
}


/* =========================================================
   SUPABASE
========================================================= */

const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    }
);


/* =========================================================
   DATA.GOV.IN API
========================================================= */

const RESOURCE_ID =
    "9ef84268-d588-465a-a308-a864a43d0070";

const DATA_GOV_URL =
    `https://api.data.gov.in/resource/${RESOURCE_ID}`;


/* =========================================================
   SETTINGS
========================================================= */

// Smaller page = more reliable with data.gov.in
const API_PAGE_SIZE = 200;

// Supabase bulk insert/update size
const DB_BATCH_SIZE = 200;

// Retry failed data.gov.in requests
const MAX_RETRIES = 5;


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
   HELPER - SLEEP
========================================================= */

function sleep(ms) {

    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );

}


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
   FIELD FINDER
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
   DATE CONVERTER
========================================================= */

function parseSourceDate(value) {

    if (!value) {
        return null;
    }

    const text =
        String(value).trim();


    // DD/MM/YYYY

    let match =
        text.match(
            /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
        );

    if (match) {

        const [, day, month, year] =
            match;

        return (
            `${year}-` +
            `${month.padStart(2, "0")}-` +
            `${day.padStart(2, "0")}`
        );

    }


    // DD-MM-YYYY

    match =
        text.match(
            /^(\d{1,2})-(\d{1,2})-(\d{4})$/
        );

    if (match) {

        const [, day, month, year] =
            match;

        return (
            `${year}-` +
            `${month.padStart(2, "0")}-` +
            `${day.padStart(2, "0")}`
        );

    }


    // YYYY-MM-DD

    if (
        /^\d{4}-\d{2}-\d{2}$/.test(text)
    ) {
        return text;
    }


    return null;
}


/* =========================================================
   NORMALIZE API RECORD
========================================================= */

function normalizeRecord(record) {

    const commodity =
        String(
            getField(record, [
                "commodity",
                "Commodity",
                "commodity_name",
                "Commodity_Name"
            ]) || ""
        ).trim();


    const variety =
        String(
            getField(record, [
                "variety",
                "Variety"
            ]) || ""
        ).trim();


    const market =
        String(
            getField(record, [
                "market",
                "Market"
            ]) || ""
        ).trim();


    const state =
        String(
            getField(record, [
                "state",
                "State"
            ]) || ""
        ).trim();


    const district =
        String(
            getField(record, [
                "district",
                "District"
            ]) || ""
        ).trim();


    const arrivalDate =
        String(
            getField(record, [
                "arrival_date",
                "Arrival_Date",
                "date",
                "Date"
            ]) || ""
        ).trim();


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


    const modalPrice =
        numberValue(
            getField(record, [
                "modal_price",
                "Modal_Price",
                "modalprice",
                "Modal Price"
            ])
        );


    return {
        commodity,
        variety,
        market,
        state,
        district,
        arrivalDate,
        minPrice,
        maxPrice,
        modalPrice
    };
}


/* =========================================================
   FETCH DATA.GOV.IN PAGE WITH RETRY
========================================================= */

async function fetchMarketPage(offset, limit) {

    const params =
        new URLSearchParams({
            "api-key":
                MARKET_API_KEY,

            format:
                "json",

            offset:
                String(offset),

            limit:
                String(limit)
        });


    const url =
        `${DATA_GOV_URL}?${params.toString()}`;


    for (
        let attempt = 1;
        attempt <= MAX_RETRIES;
        attempt++
    ) {

        try {

            console.log(
                `API_FETCH offset=${offset} limit=${limit} attempt=${attempt}`
            );


            const response =
                await fetch(url);


            if (!response.ok) {

                throw new Error(
                    `Market API HTTP ${response.status}`
                );

            }


            const data =
                await response.json();


            if (
                !Array.isArray(
                    data.records
                )
            ) {

                throw new Error(
                    "Invalid records response from Market API"
                );

            }


            console.log(
                `API_SUCCESS offset=${offset} records=${data.records.length}`
            );


            return data;

        } catch (error) {

            console.error(
                `FETCH_RETRY offset=${offset} attempt=${attempt}: ${error.message}`
            );


            if (
                attempt ===
                MAX_RETRIES
            ) {

                throw new Error(
                    `Market API fetch failed at offset ${offset} after ${MAX_RETRIES} attempts: ${error.message}`
                );

            }


            // 2 sec, 4 sec, 6 sec, 8 sec...
            const waitTime =
                attempt * 2000;


            console.log(
                `Waiting ${waitTime}ms before retry`
            );


            await sleep(
                waitTime
            );

        }

    }

}


/* =========================================================
   TEST MARKET API
========================================================= */

app.get("/test-market-api", async (req, res) => {

    try {

        const data =
            await fetchMarketPage(
                0,
                10
            );


        res.json({

            success: true,

            total:
                Number(
                    data.total || 0
                ),

            count:
                data.records.length,

            records:
                data.records

        });


    } catch (error) {

        console.error(
            "MARKET_API_ERROR:",
            error.message
        );


        res.status(500).json({

            success: false,

            error:
                error.message

        });

    }

});


/* =========================================================
   TEST SUPABASE
========================================================= */

app.get("/test-supabase", async (req, res) => {

    try {

        const {
            data,
            error
        } = await supabase
            .from("market_products")
            .select(
                "id,product_name,variety,current_price,market,state"
            )
            .limit(10);


        if (error) {
            throw error;
        }


        res.json({

            success: true,

            count:
                data?.length || 0,

            products:
                data || []

        });


    } catch (error) {

        console.error(
            "SUPABASE_TEST_ERROR:",
            error.message
        );


        res.status(500).json({

            success: false,

            error:
                error.message

        });

    }

});


/* =========================================================
   UNIQUE KEY
========================================================= */

function createUniqueKey(
    product,
    market,
    state,
    district,
    variety,
    source
) {

    return [

        product || "",
        market || "",
        state || "",
        district || "",
        variety || "",
        source || ""

    ]
        .map(value =>
            String(value)
                .trim()
                .toLowerCase()
        )
        .join("|||");

}


/* =========================================================
   LOAD EXISTING PRICES
========================================================= */

async function loadExistingPrices() {

    const priceMap =
        new Map();


    const pageSize =
        1000;


    let from = 0;


    while (true) {

        const to =
            from +
            pageSize -
            1;


        const {
            data,
            error
        } = await supabase
            .from("market_products")
            .select(`
                product_name,
                market,
                state,
                district,
                variety,
                source,
                current_price
            `)
            .range(
                from,
                to
            );


        if (error) {

            throw new Error(
                `Existing prices load failed: ${error.message}`
            );

        }


        if (
            !data ||
            data.length === 0
        ) {
            break;
        }


        for (
            const row of data
        ) {

            const key =
                createUniqueKey(

                    row.product_name,
                    row.market,
                    row.state,
                    row.district,
                    row.variety,
                    row.source

                );


            priceMap.set(
                key,
                numberValue(
                    row.current_price
                )
            );

        }


        console.log(
            `Loaded existing prices: ${priceMap.size}`
        );


        if (
            data.length <
            pageSize
        ) {
            break;
        }


        from +=
            pageSize;

    }


    return priceMap;
}


/* =========================================================
   CREATE DATABASE ROW
========================================================= */

function createDatabaseRow(
    item,
    existingPriceMap
) {

    if (
        !item.commodity
    ) {
        return null;
    }


    if (
        !item.modalPrice
    ) {
        return null;
    }


    const source =
        "data.gov.in Mandi";


    const uniqueKey =
        createUniqueKey(

            item.commodity,
            item.market,
            item.state,
            item.district,
            item.variety,
            source

        );


    const oldPrice =
        existingPriceMap.get(
            uniqueKey
        );


    return {

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

        variety:
            item.variety,

        unit:
            "quintal",

        previous_price:
            oldPrice !== undefined
                ? oldPrice
                : item.modalPrice,

        current_price:
            item.modalPrice,

        min_price:
            item.minPrice,

        max_price:
            item.maxPrice,

        source:
            source,

        source_date:
            parseSourceDate(
                item.arrivalDate
            ),

        updated_at:
            new Date()
                .toISOString()

    };

}


/* =========================================================
   REMOVE DUPLICATES FROM BATCH
========================================================= */

function removeDuplicateRows(rows) {

    const map =
        new Map();


    for (
        const row of rows
    ) {

        const key =
            createUniqueKey(

                row.product_name,
                row.market,
                row.state,
                row.district,
                row.variety,
                row.source

            );


        map.set(
            key,
            row
        );

    }


    return Array.from(
        map.values()
    );

}


/* =========================================================
   BULK SUPABASE UPSERT WITH RETRY
========================================================= */

async function bulkUpsert(rows) {

    if (
        !rows ||
        rows.length === 0
    ) {

        return 0;

    }


    for (
        let attempt = 1;
        attempt <= 3;
        attempt++
    ) {

        try {

            const {
                error
            } = await supabase
                .from(
                    "market_products"
                )
                .upsert(
                    rows,
                    {
                        onConflict:
                            "product_name,market,state,district,variety,source",

                        ignoreDuplicates:
                            false
                    }
                );


            if (error) {

                throw new Error(
                    error.message
                );

            }


            return rows.length;

        } catch (error) {

            console.error(
                `DB_RETRY attempt=${attempt}: ${error.message}`
            );


            if (
                attempt === 3
            ) {

                throw new Error(
                    `Supabase bulk upsert failed: ${error.message}`
                );

            }


            await sleep(
                attempt * 1500
            );

        }

    }

}


/* =========================================================
   SMALL BULK TEST
========================================================= */

app.get("/sync-test", async (req, res) => {

    try {

        let limit =
            Number(
                req.query.limit || 100
            );


        if (
            !Number.isFinite(limit) ||
            limit < 1
        ) {

            limit = 100;

        }


        limit =
            Math.min(
                limit,
                500
            );


        const existingPriceMap =
            await loadExistingPrices();


        const apiData =
            await fetchMarketPage(
                0,
                limit
            );


        const rows = [];

        let skipped = 0;


        for (
            const rawRecord
            of apiData.records
        ) {

            const item =
                normalizeRecord(
                    rawRecord
                );


            const row =
                createDatabaseRow(
                    item,
                    existingPriceMap
                );


            if (!row) {

                skipped++;

                continue;

            }


            rows.push(row);

        }


        const uniqueRows =
            removeDuplicateRows(
                rows
            );


        const saved =
            await bulkUpsert(
                uniqueRows
            );


        res.json({

            success: true,

            message:
                "Bulk test completed",

            apiTotal:
                Number(
                    apiData.total || 0
                ),

            fetched:
                apiData.records.length,

            saved,

            skipped

        });


    } catch (error) {

        console.error(
            "SYNC_TEST_ERROR:",
            error.message
        );


        res.status(500).json({

            success: false,

            error:
                error.message

        });

    }

});


/* =========================================================
   FULL MARKET SYNC
========================================================= */

app.get("/sync-all", async (req, res) => {

    const startedAt =
        Date.now();


    try {

        console.log(
            "=================================="
        );

        console.log(
            "FULL MARKET SYNC STARTED"
        );

        console.log(
            "=================================="
        );


        /* -------------------------------------------------
           Load previous database prices
        ------------------------------------------------- */

        const existingPriceMap =
            await loadExistingPrices();


        console.log(
            `Existing records before sync: ${existingPriceMap.size}`
        );


        let offset = 0;

        let apiTotal = 0;

        let fetched = 0;

        let saved = 0;

        let skipped = 0;

        let pages = 0;


        /* -------------------------------------------------
           PAGE LOOP
        ------------------------------------------------- */

        while (true) {

            console.log(
                `Fetching API page offset=${offset}`
            );


            const apiData =
                await fetchMarketPage(
                    offset,
                    API_PAGE_SIZE
                );


            const records =
                apiData.records || [];


            if (
                apiTotal === 0
            ) {

                apiTotal =
                    Number(
                        apiData.total || 0
                    );


                console.log(
                    `Total API records: ${apiTotal}`
                );

            }


            if (
                records.length === 0
            ) {

                console.log(
                    "No more API records"
                );

                break;

            }


            pages++;

            fetched +=
                records.length;


            /* -------------------------------------------------
               NORMALIZE
            ------------------------------------------------- */

            const pageRows = [];


            for (
                const rawRecord
                of records
            ) {

                const item =
                    normalizeRecord(
                        rawRecord
                    );


                const row =
                    createDatabaseRow(
                        item,
                        existingPriceMap
                    );


                if (!row) {

                    skipped++;

                    continue;

                }


                pageRows.push(
                    row
                );

            }


            /* -------------------------------------------------
               REMOVE DUPLICATES
            ------------------------------------------------- */

            const uniqueRows =
                removeDuplicateRows(
                    pageRows
                );


            /* -------------------------------------------------
               DB BATCHES
            ------------------------------------------------- */

            for (
                let i = 0;
                i < uniqueRows.length;
                i += DB_BATCH_SIZE
            ) {

                const batch =
                    uniqueRows.slice(
                        i,
                        i + DB_BATCH_SIZE
                    );


                const batchSaved =
                    await bulkUpsert(
                        batch
                    );


                saved +=
                    batchSaved;


                console.log(
                    `PROGRESS fetched=${fetched}/${apiTotal} saved=${saved} skipped=${skipped}`
                );

            }


            /* -------------------------------------------------
               NEXT PAGE
            ------------------------------------------------- */

            offset +=
                records.length;


            /* -------------------------------------------------
               FINISH CONDITIONS
            ------------------------------------------------- */

            if (
                records.length <
                API_PAGE_SIZE
            ) {

                console.log(
                    "Last API page reached"
                );

                break;

            }


            if (
                apiTotal > 0 &&
                offset >= apiTotal
            ) {

                console.log(
                    "API total reached"
                );

                break;

            }


            // Small pause to avoid hammering data.gov.in
            await sleep(300);

        }


        const durationSeconds =
            Number(
                (
                    (
                        Date.now() -
                        startedAt
                    ) /
                    1000
                ).toFixed(2)
            );


        console.log(
            "=================================="
        );

        console.log(
            "FULL MARKET SYNC COMPLETED"
        );

        console.log(
            `Fetched: ${fetched}`
        );

        console.log(
            `Saved: ${saved}`
        );

        console.log(
            `Skipped: ${skipped}`
        );

        console.log(
            `Pages: ${pages}`
        );

        console.log(
            `Duration: ${durationSeconds}s`
        );

        console.log(
            "=================================="
        );


        res.json({

            success: true,

            message:
                "Full market sync completed",

            apiTotal,

            fetched,

            saved,

            skipped,

            pages,

            existingBeforeSync:
                existingPriceMap.size,

            durationSeconds

        });


    } catch (error) {

        const errorMessage =
            error?.message ||
            String(error);


        console.error(
            "FULL_SYNC_ERROR:",
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
   DATABASE COUNT
========================================================= */

app.get("/database-count", async (req, res) => {

    try {

        const {
            count,
            error
        } = await supabase
            .from("market_products")
            .select(
                "*",
                {
                    count: "exact",
                    head: true
                }
            );


        if (error) {
            throw error;
        }


        res.json({

            success: true,

            count

        });


    } catch (error) {

        console.error(
            "COUNT_ERROR:",
            error.message
        );


        res.status(500).json({

            success: false,

            error:
                error.message

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

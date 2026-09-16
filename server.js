import express from "express";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

/* =========================================================
   ENV
========================================================= */

const SUPABASE_URL = process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

const MARKET_API_KEY =
    process.env.MARKET_API_KEY;

const RESOURCE_ID =
    "9ef84268-d588-465a-a308-a864a43d0070";

const DATA_GOV_URL =
    `https://api.data.gov.in/resource/${RESOURCE_ID}`;

const SOURCE_NAME =
    "data.gov.in Mandi";

const API_PAGE_SIZE = 200;
const DB_BATCH_SIZE = 200;
const MAX_RETRIES = 5;


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
   STATES
========================================================= */

const STATES = [
    "Andaman and Nicobar",
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chandigarh",
    "Chattisgarh",
    "Chhattisgarh",
    "Dadra and Nagar Haveli",
    "Daman and Diu",
    "Delhi",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jammu and Kashmir",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Ladakh",
    "Lakshadweep",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Orissa",
    "Pondicherry",
    "Puducherry",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "Uttaranchal",
    "West Bengal"
];


/* =========================================================
   HOME
========================================================= */

app.get("/", (req, res) => {

    res.json({
        status: "online",
        service: "Market Price Updater",
        mode: "KG Price Mode",
        sourceUnit: "quintal",
        databaseUnit: "kg",
        quantitySupport: [
            "250g",
            "500g",
            "1kg",
            "2kg",
            "5kg",
            "10kg"
        ]
    });

});


/* =========================================================
   SLEEP
========================================================= */

function sleep(ms) {

    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );

}


/* =========================================================
   NUMBER
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
   MONEY ROUND
========================================================= */

function money(value) {

    return Number(
        Number(value || 0)
            .toFixed(2)
    );

}


/* =========================================================
   QUINTAL -> KG

   1 Quintal = 100 KG
========================================================= */

function quintalToKg(price) {

    return money(
        numberValue(price) / 100
    );

}


/* =========================================================
   KG -> OTHER QUANTITIES
========================================================= */

function quantityPrices(pricePerKg) {

    const kg =
        numberValue(pricePerKg);

    return {

        "250g":
            money(kg * 0.25),

        "500g":
            money(kg * 0.50),

        "1kg":
            money(kg),

        "2kg":
            money(kg * 2),

        "5kg":
            money(kg * 5),

        "10kg":
            money(kg * 10)

    };

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
   DATE
========================================================= */

function parseSourceDate(value) {

    if (!value) {
        return null;
    }

    const text =
        String(value).trim();


    /* DD/MM/YYYY */

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


    /* DD-MM-YYYY */

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


    /* YYYY-MM-DD */

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

    return {

        commodity:
            String(
                getField(record, [
                    "commodity",
                    "Commodity"
                ]) || ""
            ).trim(),

        variety:
            String(
                getField(record, [
                    "variety",
                    "Variety"
                ]) || ""
            ).trim(),

        market:
            String(
                getField(record, [
                    "market",
                    "Market"
                ]) || ""
            ).trim(),

        state:
            String(
                getField(record, [
                    "state",
                    "State"
                ]) || ""
            ).trim(),

        district:
            String(
                getField(record, [
                    "district",
                    "District"
                ]) || ""
            ).trim(),

        arrivalDate:
            String(
                getField(record, [
                    "arrival_date",
                    "Arrival_Date"
                ]) || ""
            ).trim(),

        minPrice:
            numberValue(
                getField(record, [
                    "min_price",
                    "Min_Price"
                ])
            ),

        maxPrice:
            numberValue(
                getField(record, [
                    "max_price",
                    "Max_Price"
                ])
            ),

        modalPrice:
            numberValue(
                getField(record, [
                    "modal_price",
                    "Modal_Price"
                ])
            )

    };

}


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
   FETCH STATE DATA
========================================================= */

async function fetchStatePage(
    state,
    offset,
    limit
) {

    const params =
        new URLSearchParams();


    params.set(
        "api-key",
        MARKET_API_KEY
    );

    params.set(
        "format",
        "json"
    );

    params.set(
        "offset",
        String(offset)
    );

    params.set(
        "limit",
        String(limit)
    );

    params.set(
        "filters[state]",
        state
    );


    const url =
        `${DATA_GOV_URL}?${params.toString()}`;


    for (
        let attempt = 1;
        attempt <= MAX_RETRIES;
        attempt++
    ) {

        try {

            console.log(
                `FETCH ${state} offset=${offset} attempt=${attempt}`
            );


            const response =
                await fetch(url);


            if (!response.ok) {

                throw new Error(
                    `HTTP ${response.status}`
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
                    "Invalid API records"
                );

            }


            return data;

        } catch (error) {

            console.error(
                `FETCH_RETRY ${state} offset=${offset}: ${error.message}`
            );


            if (
                attempt === MAX_RETRIES
            ) {

                throw new Error(
                    `${state} fetch failed at offset ${offset}: ${error.message}`
                );

            }


            await sleep(
                attempt * 2000
            );

        }

    }

}


/* =========================================================
   LOAD EXISTING KG PRICES
========================================================= */

async function loadExistingPrices() {

    const priceMap =
        new Map();

    const PAGE_SIZE =
        1000;

    let from = 0;


    while (true) {

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
                from + PAGE_SIZE - 1
            );


        if (error) {

            throw new Error(
                error.message
            );

        }


        if (
            !data ||
            data.length === 0
        ) {

            break;

        }


        for (const row of data) {

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


        if (
            data.length < PAGE_SIZE
        ) {

            break;

        }


        from +=
            PAGE_SIZE;

    }


    console.log(
        `Existing KG prices loaded: ${priceMap.size}`
    );


    return priceMap;

}


/* =========================================================
   CREATE DATABASE ROW

   API = ₹ / quintal
   DATABASE = ₹ / kg
========================================================= */

function createDatabaseRow(
    item,
    existingPriceMap
) {

    if (
        !item.commodity ||
        !item.modalPrice
    ) {

        return null;

    }


    const currentPriceKg =
        quintalToKg(
            item.modalPrice
        );


    const minPriceKg =
        quintalToKg(
            item.minPrice
        );


    const maxPriceKg =
        quintalToKg(
            item.maxPrice
        );


    const uniqueKey =
        createUniqueKey(

            item.commodity,
            item.market,
            item.state,
            item.district,
            item.variety,
            SOURCE_NAME

        );


    /*
       Existing DB price is already KG
       because we ran migration SQL.
    */

    const oldKgPrice =
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
            "kg",

        previous_price:
            oldKgPrice !== undefined
                ? money(oldKgPrice)
                : currentPriceKg,

        current_price:
            currentPriceKg,

        min_price:
            minPriceKg,

        max_price:
            maxPriceKg,

        source:
            SOURCE_NAME,

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
   REMOVE DUPLICATES
========================================================= */

function removeDuplicateRows(rows) {

    const map =
        new Map();


    for (const row of rows) {

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
   BULK UPSERT
========================================================= */

async function bulkUpsert(rows) {

    if (!rows.length) {

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

                throw error;

            }


            return rows.length;

        } catch (error) {

            console.error(
                `DB_RETRY ${attempt}: ${error.message}`
            );


            if (
                attempt === 3
            ) {

                throw new Error(
                    `Database upsert failed: ${error.message}`
                );

            }


            await sleep(
                attempt * 1500
            );

        }

    }

}


/* =========================================================
   PRICE CALCULATOR API

   Example:
   /price?kg=26.25
========================================================= */

app.get("/price", (req, res) => {

    const pricePerKg =
        numberValue(
            req.query.kg
        );


    if (!pricePerKg) {

        return res.status(400).json({

            success: false,

            error:
                "Enter KG price. Example: /price?kg=26.25"

        });

    }


    res.json({

        success: true,

        pricePerKg:
            money(pricePerKg),

        prices:
            quantityPrices(
                pricePerKg
            )

    });

});


/* =========================================================
   TEST ANDHRA PRADESH
========================================================= */

app.get("/test-state", async (req, res) => {

    try {

        const state =
            String(
                req.query.state ||
                "Andhra Pradesh"
            );


        const data =
            await fetchStatePage(
                state,
                0,
                10
            );


        const converted =
            data.records.map(raw => {

                const item =
                    normalizeRecord(raw);


                const priceKg =
                    quintalToKg(
                        item.modalPrice
                    );


                return {

                    state:
                        item.state,

                    district:
                        item.district,

                    market:
                        item.market,

                    commodity:
                        item.commodity,

                    variety:
                        item.variety,

                    source_price_per_quintal:
                        item.modalPrice,

                    price_per_kg:
                        priceKg,

                    prices:
                        quantityPrices(
                            priceKg
                        )

                };

            });


        res.json({

            success: true,

            state,

            total:
                Number(
                    data.total || 0
                ),

            count:
                converted.length,

            records:
                converted

        });


    } catch (error) {

        res.status(500).json({

            success: false,

            error:
                error.message

        });

    }

});


/* =========================================================
   SYNC ONE STATE
========================================================= */

app.get("/sync-state", async (req, res) => {

    const startedAt =
        Date.now();


    try {

        const state =
            String(
                req.query.state ||
                "Andhra Pradesh"
            ).trim();


        const existingPrices =
            await loadExistingPrices();


        let offset = 0;

        let stateTotal = 0;

        let fetched = 0;

        let saved = 0;

        let skipped = 0;

        let pages = 0;


        while (true) {

            const data =
                await fetchStatePage(
                    state,
                    offset,
                    API_PAGE_SIZE
                );


            if (!stateTotal) {

                stateTotal =
                    Number(
                        data.total || 0
                    );

            }


            const records =
                data.records || [];


            if (!records.length) {

                break;

            }


            fetched +=
                records.length;

            pages++;


            const rows = [];


            for (const raw of records) {

                const item =
                    normalizeRecord(raw);


                const row =
                    createDatabaseRow(
                        item,
                        existingPrices
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


                saved +=
                    await bulkUpsert(
                        batch
                    );

            }


            offset +=
                records.length;


            console.log(
                `${state}: ${fetched}/${stateTotal}`
            );


            if (
                records.length <
                API_PAGE_SIZE
            ) {

                break;

            }


            if (
                stateTotal &&
                offset >= stateTotal
            ) {

                break;

            }


            await sleep(250);

        }


        res.json({

            success: true,

            state,

            unit:
                "kg",

            stateTotal,

            fetched,

            saved,

            skipped,

            pages,

            durationSeconds:
                Number(
                    (
                        (
                            Date.now() -
                            startedAt
                        ) /
                        1000
                    ).toFixed(2)
                )

        });


    } catch (error) {

        console.error(
            "STATE_SYNC_ERROR:",
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
   FULL INDIA STATE-WISE SYNC
========================================================= */

app.get("/sync-all", async (req, res) => {

    const startedAt =
        Date.now();


    try {

        console.log(
            "FULL KG MARKET SYNC STARTED"
        );


        const existingPrices =
            await loadExistingPrices();


        let totalFetched = 0;

        let totalSaved = 0;

        let totalSkipped = 0;

        let totalPages = 0;


        const stateResults = [];


        for (const state of STATES) {

            console.log(
                `START: ${state}`
            );


            let offset = 0;

            let stateTotal = 0;

            let stateFetched = 0;

            let stateSaved = 0;

            let stateSkipped = 0;

            let statePages = 0;


            while (true) {

                const data =
                    await fetchStatePage(
                        state,
                        offset,
                        API_PAGE_SIZE
                    );


                if (!stateTotal) {

                    stateTotal =
                        Number(
                            data.total || 0
                        );

                }


                const records =
                    data.records || [];


                if (!records.length) {

                    break;

                }


                stateFetched +=
                    records.length;

                statePages++;


                const rows = [];


                for (const raw of records) {

                    const item =
                        normalizeRecord(raw);


                    const row =
                        createDatabaseRow(
                            item,
                            existingPrices
                        );


                    if (!row) {

                        stateSkipped++;

                        continue;

                    }


                    rows.push(row);

                }


                const uniqueRows =
                    removeDuplicateRows(
                        rows
                    );


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


                    stateSaved +=
                        await bulkUpsert(
                            batch
                        );

                }


                offset +=
                    records.length;


                console.log(
                    `${state}: fetched=${stateFetched}/${stateTotal} saved=${stateSaved}`
                );


                if (
                    records.length <
                    API_PAGE_SIZE
                ) {

                    break;

                }


                if (
                    stateTotal &&
                    offset >= stateTotal
                ) {

                    break;

                }


                await sleep(250);

            }


            totalFetched +=
                stateFetched;

            totalSaved +=
                stateSaved;

            totalSkipped +=
                stateSkipped;

            totalPages +=
                statePages;


            stateResults.push({

                state,

                apiTotal:
                    stateTotal,

                fetched:
                    stateFetched,

                saved:
                    stateSaved,

                skipped:
                    stateSkipped

            });


            console.log(
                `DONE: ${state}`
            );


            await sleep(500);

        }


        res.json({

            success: true,

            message:
                "Full India KG market sync completed",

            unit:
                "kg",

            fetched:
                totalFetched,

            saved:
                totalSaved,

            skipped:
                totalSkipped,

            pages:
                totalPages,

            durationSeconds:
                Number(
                    (
                        (
                            Date.now() -
                            startedAt
                        ) /
                        1000
                    ).toFixed(2)
                ),

            states:
                stateResults

        });


    } catch (error) {

        console.error(
            "FULL_SYNC_ERROR:",
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

        res.status(500).json({

            success: false,

            error:
                error.message

        });

    }

});


/* =========================================================
   SERVER
========================================================= */

app.listen(PORT, () => {

    console.log(
        `Market Price Updater running on port ${PORT}`
    );

});

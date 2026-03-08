import { estimateMovableAsset } from "./movableAssetEstimator.js";
import { pool } from "../db/pool.js";

async function backfillMovableAssetEstimations() {
  const rowsResult = await pool.query(
    `
      SELECT id, declaration_id, item_text
      FROM declaration_movable_assets
      ORDER BY id ASC
    `,
  );

  let processed = 0;
  for (const row of rowsResult.rows) {
    const estimation = await estimateMovableAsset(row.item_text);

    await pool.query(
      `
        INSERT INTO declaration_movable_asset_estimations (
          movable_asset_id,
          declaration_id,
          raw_item_text,
          asset_type,
          brand_or_maker,
          year_of_manufacture,
          llm_estimated_price_eur,
          final_price_eur,
          estimation_source,
          confidence,
          applied_rule,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (movable_asset_id)
        DO UPDATE SET
          declaration_id = EXCLUDED.declaration_id,
          raw_item_text = EXCLUDED.raw_item_text,
          asset_type = EXCLUDED.asset_type,
          brand_or_maker = EXCLUDED.brand_or_maker,
          year_of_manufacture = EXCLUDED.year_of_manufacture,
          llm_estimated_price_eur = EXCLUDED.llm_estimated_price_eur,
          final_price_eur = EXCLUDED.final_price_eur,
          estimation_source = EXCLUDED.estimation_source,
          confidence = EXCLUDED.confidence,
          applied_rule = EXCLUDED.applied_rule,
          updated_at = NOW()
      `,
      [
        row.id,
        row.declaration_id,
        estimation.raw,
        estimation.assetType,
        estimation.brandOrMaker,
        estimation.yearOfManufacture,
        estimation.llmEstimatedPriceEur,
        estimation.finalPriceEur,
        estimation.estimationSource,
        estimation.confidence,
        estimation.appliedRule,
      ],
    );

    processed += 1;
    if (processed % 100 === 0) {
      console.log(`Processed ${processed} movable assets`);
    }
  }

  console.log(`Backfill completed. Processed ${processed} movable assets.`);
}

backfillMovableAssetEstimations()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error("Backfill failed:", error);
    await pool.end();
    process.exitCode = 1;
  });

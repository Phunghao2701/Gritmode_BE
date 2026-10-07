import pool from "../config/database.js";

const runner = (client) => client || pool;

export const administrativeAddressRepository = {
  async getLatestTree(client) {
    const db = runner(client);
    const datasetResult = await db.query(`
      SELECT administrative_dataset_id, source_name, effective_date::text AS effective_date, source_url,
             checksum_sha256, province_count, commune_count, synced_at
      FROM administrative_dataset
      ORDER BY effective_date DESC, synced_at DESC
      LIMIT 1
    `);

    const dataset = datasetResult.rows[0];
    if (!dataset) return null;

    const [provinceResult, communeResult] = await Promise.all([
      db.query(`
        SELECT province_code, province_name, administrative_type, urban_type, region_name
        FROM administrative_province
        WHERE administrative_dataset_id = $1
        ORDER BY province_name ASC
      `, [dataset.administrative_dataset_id]),
      db.query(`
        SELECT province_code, district_code, district_name, commune_code, commune_name,
               administrative_type, urban_type, region_name, rural_urban_type, area_type
        FROM administrative_commune
        WHERE administrative_dataset_id = $1
        ORDER BY province_code ASC, commune_name ASC
      `, [dataset.administrative_dataset_id]),
    ]);

    const communesByProvince = new Map();
    for (const commune of communeResult.rows) {
      const list = communesByProvince.get(commune.province_code) || [];
      list.push({
        code: commune.commune_code,
        name: commune.commune_name,
        type: commune.administrative_type,
        urbanType: commune.urban_type,
        districtCode: commune.district_code,
        districtName: commune.district_name,
        regionName: commune.region_name,
        ruralUrbanType: commune.rural_urban_type,
        areaType: commune.area_type,
      });
      communesByProvince.set(commune.province_code, list);
    }

    return {
      source: dataset.source_name,
      sourceUrl: dataset.source_url,
      effectiveDate: dataset.effective_date,
      syncedAt: dataset.synced_at,
      checksum: dataset.checksum_sha256,
      datasetId: dataset.administrative_dataset_id,
      provinces: provinceResult.rows.map((province) => ({
        code: province.province_code,
        name: province.province_name,
        type: province.administrative_type,
        urbanType: province.urban_type,
        regionName: province.region_name,
        communes: communesByProvince.get(province.province_code) || [],
      })),
    };
  },
};

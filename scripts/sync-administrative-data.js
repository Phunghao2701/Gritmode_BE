import dotenv from "dotenv";
import axios from "axios";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env") });
const { default: pool } = await import("../src/config/database.js");

const SOURCE_NAME = "NSO_VIETNAM_ADMINISTRATIVE_DIVISIONS";
const SOURCE_URL = "https://danhmuchanhchinh.nso.gov.vn/DMDVHC.asmx";
const SOAP_NAMESPACE = "http://tempuri.org/";

const xmlEscape = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const xmlDecode = (value = "") => String(value)
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&quot;", '"')
  .replaceAll("&apos;", "'")
  .replaceAll("&amp;", "&")
  .trim();

const readTag = (row, tag) => {
  const match = row.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? xmlDecode(match[1]) : null;
};

export const parseSoapTables = (xml) => {
  const fault = xml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
  if (fault) throw new Error(`NSO SOAP fault: ${xmlDecode(fault[1])}`);

  return [...String(xml).matchAll(/<TABLE\b[^>]*>([\s\S]*?)<\/TABLE>/gi)].map((match) => {
    const row = match[1];
    return {
      provinceCode: readTag(row, "MaTinh"),
      provinceName: readTag(row, "TenTinh"),
      provinceType: readTag(row, "LoaiHinh"),
      urbanType: readTag(row, "LoaiDoThi"),
      regionName: readTag(row, "Vung"),
      districtCode: readTag(row, "MaQuanHuyen"),
      districtName: readTag(row, "TenQuanHuyen"),
      communeCode: readTag(row, "MaPhuongXa"),
      communeName: readTag(row, "TenPhuongXa"),
      ruralUrbanType: readTag(row, "TThi_NThon"),
      areaType: readTag(row, "KhuVuc"),
      communeType: readTag(row, "LoaiHinh"),
    };
  });
};

const formatSoapDate = (isoDate) => {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
};

const soapEnvelope = (operation, fields) => `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${operation} xmlns="${SOAP_NAMESPACE}">
      ${Object.entries(fields).map(([key, value]) => `<${key}>${xmlEscape(value || "")}</${key}>`).join("")}
    </${operation}>
  </soap:Body>
</soap:Envelope>`;

export const fetchSoapTables = async (operation, fields, { timeout = 60000 } = {}) => {
  const response = await axios.post(
    SOURCE_URL,
    soapEnvelope(operation, fields),
    {
      timeout,
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${SOAP_NAMESPACE}${operation}"`,
      },
      responseType: "text",
    },
  );
  return parseSoapTables(response.data);
};

const uniqueBy = (rows, key) => [...new Map(rows.filter((row) => row[key]).map((row) => [row[key], row])).values()];

export const fetchOfficialSnapshot = async (effectiveDate) => {
  const date = formatSoapDate(effectiveDate);
  const provinceRows = uniqueBy(
    await fetchSoapTables("DanhMucTinh", { DenNgay: date }),
    "provinceCode",
  );

  if (provinceRows.length === 0) {
    throw new Error("NSO không trả về tỉnh/thành nào; dừng đồng bộ để bảo vệ dữ liệu hiện có");
  }

  const communeRows = [];
  let cursor = 0;
  const workerCount = Math.min(4, provinceRows.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < provinceRows.length) {
      const province = provinceRows[cursor++];
      const rows = await fetchSoapTables("DanhMucPhuongXa", {
        DenNgay: date,
        Tinh: province.provinceCode,
        TenTinh: province.provinceName,
        QuanHuyen: "",
        TenQuanHuyen: "",
      });
      communeRows.push(...rows);
    }
  }));

  const communes = uniqueBy(communeRows, "communeCode");
  if (communes.length === 0 || communes.some((row) => !row.provinceCode || !row.communeName)) {
    throw new Error("NSO trả về dữ liệu phường/xã không hợp lệ; dừng đồng bộ để bảo vệ dữ liệu hiện có");
  }
  const communeProvinceCodes = new Set(communes.map((row) => row.provinceCode));
  if (provinceRows.some((province) => !communeProvinceCodes.has(province.provinceCode))) {
    throw new Error("NSO trả về tỉnh/thành không có phường/xã; dừng đồng bộ để bảo vệ dữ liệu hiện có");
  }

  const provinces = provinceRows.map((row) => ({
    code: row.provinceCode,
    name: row.provinceName,
    type: row.provinceType,
    urbanType: row.urbanType,
    regionName: row.regionName,
  }));
  const normalizedCommunes = communes.map((row) => ({
    provinceCode: row.provinceCode,
    districtCode: row.districtCode,
    districtName: row.districtName,
    code: row.communeCode,
    name: row.communeName,
    type: row.communeType,
    urbanType: row.urbanType,
    regionName: row.regionName,
    ruralUrbanType: row.ruralUrbanType,
    areaType: row.areaType,
  }));

  return {
    effectiveDate,
    provinces,
    communes: normalizedCommunes,
    checksum: createHash("sha256")
      .update(JSON.stringify({ provinces, communes: normalizedCommunes }))
      .digest("hex"),
  };
};

const insertBatches = async (client, table, columns, rows, mapRow, batchSize = 200) => {
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = [];
    const placeholders = batch.map((row, rowIndex) => {
      const mapped = mapRow(row);
      const rowPlaceholders = mapped.map((value, valueIndex) => {
        values.push(value);
        return `$${rowIndex * mapped.length + valueIndex + 1}`;
      });
      return `(${rowPlaceholders.join(", ")})`;
    });
    await client.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders.join(", ")}`,
      values,
    );
  }
};

export const saveSnapshot = async (snapshot, client) => {
  const datasetResult = await client.query(`
    INSERT INTO administrative_dataset
      (source_name, effective_date, source_url, checksum_sha256, province_count, commune_count, synced_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    ON CONFLICT (source_name, effective_date)
    DO UPDATE SET source_url = EXCLUDED.source_url,
                  checksum_sha256 = EXCLUDED.checksum_sha256,
                  province_count = EXCLUDED.province_count,
                  commune_count = EXCLUDED.commune_count,
                  synced_at = NOW(),
                  updated_at = NOW()
    RETURNING administrative_dataset_id
  `, [SOURCE_NAME, snapshot.effectiveDate, SOURCE_URL, snapshot.checksum, snapshot.provinces.length, snapshot.communes.length]);

  const datasetId = datasetResult.rows[0].administrative_dataset_id;
  await client.query("DELETE FROM administrative_commune WHERE administrative_dataset_id = $1", [datasetId]);
  await client.query("DELETE FROM administrative_province WHERE administrative_dataset_id = $1", [datasetId]);

  await insertBatches(
    client,
    "administrative_province",
    ["administrative_dataset_id", "province_code", "province_name", "administrative_type", "urban_type", "region_name"],
    snapshot.provinces,
    (row) => [datasetId, row.code, row.name, row.type, row.urbanType, row.regionName],
  );
  await insertBatches(
    client,
    "administrative_commune",
    ["administrative_dataset_id", "province_code", "district_code", "district_name", "commune_code", "commune_name", "administrative_type", "urban_type", "region_name", "rural_urban_type", "area_type"],
    snapshot.communes,
    (row) => [datasetId, row.provinceCode, row.districtCode, row.districtName, row.code, row.name, row.type, row.urbanType, row.regionName, row.ruralUrbanType, row.areaType],
  );

  return { datasetId, provinceCount: snapshot.provinces.length, communeCount: snapshot.communes.length };
};

const getVietnamDate = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date()).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const syncAdministrativeData = async ({ effectiveDate = getVietnamDate() } = {}) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    throw new Error("--date phải có định dạng YYYY-MM-DD");
  }

  console.log(`[Administrative sync] Tải dữ liệu NSO ngày ${effectiveDate}...`);
  const snapshot = await fetchOfficialSnapshot(effectiveDate);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await saveSnapshot(snapshot, client);
    await client.query("COMMIT");
    console.log(`[Administrative sync] Hoàn tất: ${result.provinceCount} tỉnh/thành, ${result.communeCount} phường/xã.`);
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dateArgIndex = process.argv.indexOf("--date");
  const effectiveDate = dateArgIndex >= 0 ? process.argv[dateArgIndex + 1] : undefined;
  syncAdministrativeData({ effectiveDate })
    .catch((error) => {
      console.error(`[Administrative sync] Thất bại: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

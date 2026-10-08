import axios from "axios";

const BANK_DIRECTORY_URL = "https://api.vietqr.io/v2/banks";
const BANK_DIRECTORY_TTL_MS = 6 * 60 * 60 * 1000;
const BANK_DIRECTORY_TIMEOUT_MS = 3000;

let cachedDirectory = null;
let cachedUntil = 0;
let directoryRequest = null;

const normalizeBin = (bin) => {
  const value = String(bin ?? "").trim();
  return /^\d{6}$/.test(value) ? value : null;
};

const fetchBankDirectory = async () => {
  const response = await axios.get(BANK_DIRECTORY_URL, {
    timeout: BANK_DIRECTORY_TIMEOUT_MS,
  });

  const banks = response.data?.code === "00" && Array.isArray(response.data?.data)
    ? response.data.data
    : [];

  const directory = new Map(
    banks
      .map((bank) => [normalizeBin(bank?.bin), String(bank?.shortName || bank?.short_name || "").trim()])
      .filter(([bin, name]) => bin && name),
  );

  if (!directory.size) {
    throw new Error("VietQR bank directory returned no usable banks");
  }

  cachedDirectory = directory;
  cachedUntil = Date.now() + BANK_DIRECTORY_TTL_MS;
  return directory;
};

const getBankDirectory = async () => {
  if (cachedDirectory && cachedUntil > Date.now()) return cachedDirectory;
  if (directoryRequest) return directoryRequest;

  directoryRequest = fetchBankDirectory()
    .catch(() => cachedDirectory || new Map())
    .finally(() => {
      directoryRequest = null;
    });

  return directoryRequest;
};

export const resolveVietQrBankName = async (bin) => {
  const normalizedBin = normalizeBin(bin);
  if (!normalizedBin) return null;

  const directory = await getBankDirectory();
  return directory.get(normalizedBin) || null;
};


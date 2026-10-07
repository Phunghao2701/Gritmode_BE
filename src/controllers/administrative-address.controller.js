import { ok } from "../utils/api-response.js";
import { administrativeAddressRepository } from "../repositories/administrative-address.repository.js";

export const getAdministrativeAddresses = async (req, res, next) => {
  try {
    const tree = await administrativeAddressRepository.getLatestTree();
    return ok(res, tree || {
      source: "NSO",
      effectiveDate: null,
      syncedAt: null,
      datasetId: null,
      provinces: [],
    }, { message: "Lấy danh mục địa chỉ thành công" });
  } catch (error) {
    next(error);
  }
};

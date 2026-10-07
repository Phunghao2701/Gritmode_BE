import { notFound } from "../errors/app-error.js";
import { addressRepository } from "../repositories/address.repository.js";
import { withTransaction } from "../config/database.js";

export const createAddressService = ({
  addresses = addressRepository,
  transaction = withTransaction,
} = {}) => ({
  list: (userId) => addresses.list(userId),
  listAddresses: (userId) => addresses.list(userId),

  async getById(userId, addressId) {
    const address = await addresses.findById(addressId, userId);
    if (!address) throw notFound("ADDRESS_NOT_FOUND", "Không tìm thấy địa chỉ");
    return address;
  },
  async getAddressById(userId, addressId) {
    const address = await addresses.findById(addressId, userId);
    if (!address) throw notFound("ADDRESS_NOT_FOUND", "Không tìm thấy địa chỉ");
    return address;
  },

  async create(userId, input) {
    return transaction(async (client) => {
      const count = await addresses.countByUser(userId, client);

      const shouldBeDefault = count === 0 || Boolean(input.is_default);

      if (shouldBeDefault) {
        await addresses.unsetDefault(userId, client);
      }

      const addressToCreate = {
        ...input,
        is_default: shouldBeDefault,
      };

      const created = await addresses.create(userId, addressToCreate, client);
      return shouldBeDefault && !created.is_default
        ? addresses.setDefault(created.user_address_id, userId, client)
        : created;
    });
  },
  async createAddress(userId, input) {
    return this.create(userId, input);
  },

  async update(userId, addressId, input) {
    return transaction(async (client) => {
      const existing = await addresses.findById(addressId, userId, client);
      if (!existing) throw notFound("ADDRESS_NOT_FOUND", "Không tìm thấy địa chỉ");

      const address = await addresses.update(addressId, userId, input, client);
      if (!address) throw notFound("ADDRESS_NOT_FOUND", "Không tìm thấy địa chỉ");
      return address;
    });
  },
  async updateAddress(userId, addressId, input) {
    return this.update(userId, addressId, input);
  },

  async remove(userId, addressId) {
    return transaction(async (client) => {
      const existing = await addresses.findById(addressId, userId, client);
      if (!existing) throw notFound("ADDRESS_NOT_FOUND", "Không tìm thấy địa chỉ");

      const removed = await addresses.remove(addressId, userId, client);
      if (!removed) throw notFound("ADDRESS_NOT_FOUND", "Không tìm thấy địa chỉ");

      if (existing.is_default) {
        const newest = await addresses.findNewest(userId, client);
        if (newest) {
          await addresses.setDefault(newest.user_address_id, userId, client);
        }
      }
    });
  },
  async removeAddress(userId, addressId) {
    return this.remove(userId, addressId);
  },

  async setDefault(userId, addressId) {
    const address = await transaction((client) => addresses.setDefault(addressId, userId, client));
    if (!address) throw notFound("ADDRESS_NOT_FOUND", "Không tìm thấy địa chỉ");
    return address;
  },
  async setDefaultAddress(userId, addressId) {
    return this.setDefault(userId, addressId);
  },
});

const defaultAddressService = createAddressService();

export const {
  list,
  listAddresses,
  getById,
  getAddressById,
  create,
  createAddress,
  update,
  updateAddress,
  remove,
  removeAddress,
  setDefault,
  setDefaultAddress,
} = defaultAddressService;

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createAddressService,
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
} from "../../../src/services/address.service.js";

const sampleAddress = {
  user_address_id: 1,
  user_id: "u1",
  receiver_name_user_address: "Nguyen Van A",
  phone_user_address: "0912345678",
  address_line_user_address: "123 Street",
  is_default: false,
};

describe("address service", () => {
  const transaction = async (fn) => fn({});

  test("gets address by id when owned and via aliases", async () => {
    const service = createAddressService({
      addresses: {
        findById: async (id, userId) => (id === 1 && userId === "u1" ? sampleAddress : null),
        list: async () => [sampleAddress],
      },
      transaction,
    });
    const addr = await service.getById("u1", 1);
    assert.equal(addr.user_address_id, 1);
    const addrAlias = await service.getAddressById("u1", 1);
    assert.equal(addrAlias.user_address_id, 1);
    const listResult = await service.listAddresses("u1");
    assert.equal(listResult.length, 1);
  });

  test("creates first address as default automatically and via createAddress alias", async () => {
    let captured = null;
    const service = createAddressService({
      addresses: {
        countByUser: async () => 0,
        unsetDefault: async () => {},
        create: async (userId, data) => {
          captured = data;
          return { user_address_id: 1, ...data };
        },
      },
      transaction,
    });

    await service.createAddress("u1", {
      receiver_name_user_address: "Nguyen Van A",
      phone_user_address: "0912345678",
      address_line_user_address: "123 Street",
      is_default: false,
    });

    assert.equal(captured.is_default, true);
  });

  test("creates subsequent address as non-default when is_default is false", async () => {
    let unsetCalled = false;
    let captured = null;
    const service = createAddressService({
      addresses: {
        countByUser: async () => 1,
        unsetDefault: async () => {
          unsetCalled = true;
        },
        create: async (userId, data) => {
          captured = data;
          return { user_address_id: 2, ...data };
        },
      },
      transaction,
    });

    const created = await service.create("u1", {
      receiver_name_user_address: "Nguyen Van B",
      phone_user_address: "0912345678",
      address_line_user_address: "456 Street",
      is_default: false,
    });

    assert.equal(unsetCalled, false);
    assert.equal(captured.is_default, false);
    assert.equal(created.user_address_id, 2);
  });

  test("creates and promotes a default address", async () => {
    let unsetCalled = false;
    let captured = null;
    const service = createAddressService({
      addresses: {
        countByUser: async () => 2,
        unsetDefault: async () => {
          unsetCalled = true;
        },
        create: async (userId, data) => {
          captured = data;
          return { user_address_id: 2, ...data };
        },
      },
      transaction,
    });

    await service.create("u1", {
      receiver_name_user_address: "Nguyen Van B",
      phone_user_address: "0912345678",
      address_line_user_address: "456 Street",
      is_default: true,
    });

    assert.equal(unsetCalled, true);
    assert.equal(captured.is_default, true);
  });

  test("updates, deletes and sets an owned address via aliases", async () => {
    const service = createAddressService({
      addresses: {
        findById: async () => sampleAddress,
        update: async (id, userId, data) => ({ ...sampleAddress, ...data }),
        remove: async () => true,
        setDefault: async (id) => ({ ...sampleAddress, user_address_id: id, is_default: true }),
      },
      transaction,
    });

    const updated = await service.updateAddress("u1", 1, { receiver_name_user_address: "New Name" });
    assert.equal(updated.receiver_name_user_address, "New Name");

    await service.removeAddress("u1", 1);

    const defaulted = await service.setDefaultAddress("u1", 1);
    assert.equal(defaulted.is_default, true);
  });

  test("deleting a default address promotes newest remaining address", async () => {
    let promotedId = null;
    const service = createAddressService({
      addresses: {
        findById: async () => ({ ...sampleAddress, is_default: true }),
        remove: async () => true,
        findNewest: async () => ({ user_address_id: 2 }),
        setDefault: async (id) => {
          promotedId = id;
          return { user_address_id: id, is_default: true };
        },
      },
      transaction,
    });

    await service.remove("u1", 1);
    assert.equal(promotedId, 2);
  });

  test("deleting a default address when no other address remains succeeds", async () => {
    let setDefaultCalled = false;
    const service = createAddressService({
      addresses: {
        findById: async () => ({ ...sampleAddress, is_default: true }),
        remove: async () => true,
        findNewest: async () => null,
        setDefault: async () => {
          setDefaultCalled = true;
        },
      },
      transaction,
    });

    await service.remove("u1", 1);
    assert.equal(setDefaultCalled, false);
  });

  test("hides absent or foreign address as not found", async () => {
    const service = createAddressService({
      addresses: {
        findById: async () => null,
        update: async () => null,
        remove: async () => false,
        setDefault: async () => null,
      },
      transaction,
    });

    await assert.rejects(service.getById("u1", 999), (e) => e.code === "ADDRESS_NOT_FOUND" && e.statusCode === 404);
    await assert.rejects(service.update("u1", 999, {}), (e) => e.code === "ADDRESS_NOT_FOUND");
    await assert.rejects(service.remove("u1", 999), (e) => e.code === "ADDRESS_NOT_FOUND");
    await assert.rejects(service.setDefault("u1", 999), (e) => e.code === "ADDRESS_NOT_FOUND");
  });

  test("exported standalone functions route through default service instance", () => {
    assert.equal(typeof list, "function");
    assert.equal(typeof listAddresses, "function");
    assert.equal(typeof getById, "function");
    assert.equal(typeof getAddressById, "function");
    assert.equal(typeof create, "function");
    assert.equal(typeof createAddress, "function");
    assert.equal(typeof update, "function");
    assert.equal(typeof updateAddress, "function");
    assert.equal(typeof remove, "function");
    assert.equal(typeof removeAddress, "function");
    assert.equal(typeof setDefault, "function");
    assert.equal(typeof setDefaultAddress, "function");
  });
});

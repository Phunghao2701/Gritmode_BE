import { AppError } from "../errors/app-error.js";
import { PRODUCT_STATUSES } from "../constants/product.js";

const isString = (value) => typeof value === 'string';
const isBoolean = (value) => typeof value === 'boolean';

export const slugify = (text = "") => {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[đĐ]/g, "d")
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/[\s_]+/g, "-")
        .replace(/^-+|-+$/g, "");
};

const requiredString = (value, minLength = 1, maxLength = 255) => {
    if (!isString(value)) return false;
    const trimmed = value.trim();
    return trimmed.length >= minLength && trimmed.length <= maxLength;
};

export const validatePositiveId = (value) => {
    if (value === null || value === undefined || typeof value === 'boolean') {
        throw new AppError(400, 'INVALID_ID', 'ID không hợp lệ');
    }
    const str = String(value).trim();
    if (!/^[1-9]\d*$/.test(str)) {
        throw new AppError(400, 'INVALID_ID', 'ID không hợp lệ');
    }
    const num = Number(str);
    if (!Number.isSafeInteger(num) || num <= 0) {
        throw new AppError(400, 'INVALID_ID', 'ID không hợp lệ');
    }
    return num;
};

export const isValidEmail = (email) => {
    if (!requiredString(email, 5, 255)) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

export const normalizePhone = (raw) => {
    if (!raw || typeof raw !== 'string') return null;
    let cleaned = raw.trim().replace(/[\s.-]/g, '');
    if (cleaned.startsWith('+84')) {
        cleaned = '0' + cleaned.slice(3);
    } else if (cleaned.startsWith('84') && cleaned.length === 11) {
        cleaned = '0' + cleaned.slice(2);
    }
    return /^0\d{9}$/.test(cleaned) ? cleaned : null;
};

export const isStrongPassword = (password) => {
    if (!requiredString(password, 8, 128)) return false;
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    return hasNumber && hasSpecial;
};

export const validateRequestOtp = (input = {}) => {
    const errors = [];
    if (!input || typeof input !== 'object') {
        errors.push({ field: 'body', message: 'Dữ liệu không hợp lệ' });
        return { ok: false, errors };
    }

    if (!input.email || !isValidEmail(input.email)) {
        errors.push({ field: 'email', message: 'Email không đúng định dạng hoặc vượt quá độ dài cho phép' });
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            email: input.email.trim().toLowerCase(),
        },
    };
};

export const validateVerifyOtp = (input = {}) => {
    const errors = [];
    if (!input || typeof input !== 'object') {
        errors.push({ field: 'body', message: 'Dữ liệu không hợp lệ' });
        return { ok: false, errors };
    }

    if (!input.email || !isValidEmail(input.email)) {
        errors.push({ field: 'email', message: 'Email không đúng định dạng hoặc vượt quá độ dài cho phép' });
    }

    if (!input.otp || typeof input.otp !== 'string' || !/^\d{6}$/.test(input.otp.trim())) {
        errors.push({ field: 'otp', message: 'Mã OTP bắt buộc gồm đúng 6 chữ số' });
    }

    let guestToken = undefined;
    if (input.guest_token !== undefined && input.guest_token !== null) {
        if (typeof input.guest_token === 'string' && input.guest_token.trim().length > 0) {
            guestToken = input.guest_token.trim();
        }
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            email: input.email.trim().toLowerCase(),
            otp: input.otp.trim(),
            guest_token: guestToken,
        },
    };
};

export const validateGoogleLogin = (input = {}) => {
    const errors = [];
    if (!input || typeof input !== 'object') {
        return { ok: false, errors: [{ field: 'body', message: 'Dữ liệu không hợp lệ' }] };
    }
    if (!requiredString(input.access_token, 20, 10000)) {
        errors.push({ field: 'access_token', message: 'Google access token không hợp lệ' });
    }
    const guestToken = requiredString(input.guest_token, 1, 255) ? input.guest_token.trim() : undefined;
    if (errors.length) return { ok: false, errors };
    return { ok: true, value: { access_token: input.access_token.trim(), guest_token: guestToken } };
};

export const validateRefreshToken = (input = {}) => {
    const errors = [];
    if (!input || typeof input !== 'object') {
        errors.push({ field: 'body', message: 'Dữ liệu không hợp lệ' });
        return { ok: false, errors };
    }

    if (!input.refresh_token || typeof input.refresh_token !== 'string' || input.refresh_token.trim().length === 0) {
        errors.push({ field: 'refresh_token', message: 'Refresh token là bắt buộc' });
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            refresh_token: input.refresh_token.trim(),
        },
    };
};


export const validatePasswordChange = (input = {}) => {
    const errors = [];
    if (!requiredString(input.current_password, 1, 128)) {
        errors.push({ field: 'current_password', message: 'Mật khẩu hiện tại không được để trống' });
    }
    if (!isStrongPassword(input.new_password)) {
        errors.push({ field: 'new_password', message: 'Mật khẩu mới phải từ 8 ký tự, có ít nhất 1 chữ số và 1 ký tự đặc biệt' });
    }
    if (errors.length) return { ok: false, errors };
    return {
        ok: true,
        value: {
            current_password: input.current_password,
            new_password: input.new_password,
        },
    };
};

export const validateUpdateProfile = (input = {}) => {
    const errors = [];
    const forbiddenFields = ['role', 'status', 'type', 'password', 'email', 'user_id', 'password_hash', 'refresh_token_hash'];
    for (const field of forbiddenFields) {
        if (field in input) {
            errors.push({ field, message: `Không được phép cập nhật trường ${field}` });
        }
    }

    const value = {};
    if (input.full_name !== undefined) {
        if (!requiredString(input.full_name, 2, 100)) {
            errors.push({ field: 'full_name', message: 'Họ tên phải từ 2 đến 100 ký tự' });
        } else {
            value.full_name = input.full_name.trim();
        }
    }

    if (input.phone !== undefined) {
        const normalized = normalizePhone(input.phone);
        if (!normalized) {
            errors.push({ field: 'phone', message: 'Số điện thoại phải gồm 10 chữ số hợp lệ (bắt đầu bằng 0 hoặc +84)' });
        } else {
            value.phone = normalized;
        }
    }

    if (input.url_image !== undefined) {
        if (input.url_image !== null && (!isString(input.url_image) || input.url_image.trim().length > 1000)) {
            errors.push({ field: 'url_image', message: 'Ảnh đại diện không hợp lệ' });
        } else {
            value.url_image = input.url_image ? input.url_image.trim() : null;
        }
    }

    if (input.date_of_birth !== undefined) {
        if (input.date_of_birth !== null) {
            const date = new Date(input.date_of_birth);
            if (isNaN(date.getTime()) || date > new Date()) {
                errors.push({ field: 'date_of_birth', message: 'Ngày sinh không hợp lệ hoặc lớn hơn ngày hiện tại' });
            } else {
                value.date_of_birth = input.date_of_birth;
            }
        } else {
            value.date_of_birth = null;
        }
    }

    if (input.gender !== undefined) {
        if (input.gender !== null && !isBoolean(input.gender)) {
            errors.push({ field: 'gender', message: 'Giới tính phải là boolean hoặc null' });
        } else {
            value.gender = input.gender;
        }
    }

    if (errors.length) return { ok: false, errors };
    return { ok: true, value };
};

export const validateCreateAddress = (input = {}) => {
    const errors = [];
    const forbiddenFields = ['user_address_id', 'user_id', 'created_at', 'updated_at'];
    for (const field of forbiddenFields) {
        if (field in input) {
            errors.push({ field, message: `Không được phép truyền trường ${field}` });
        }
    }

    if (!requiredString(input.receiver_name_user_address, 2, 100)) {
        errors.push({ field: 'receiver_name_user_address', message: 'Tên người nhận bắt buộc từ 2 đến 100 ký tự' });
    }
    const normalizedPhone = normalizePhone(input.phone_user_address);
    if (!normalizedPhone) {
        errors.push({ field: 'phone_user_address', message: 'Số điện thoại người nhận phải gồm 10 chữ số hợp lệ (bắt đầu bằng 0 hoặc +84)' });
    }
    if (!requiredString(input.address_line_user_address, 5, 255)) {
        errors.push({ field: 'address_line_user_address', message: 'Địa chỉ chi tiết bắt buộc từ 5 đến 255 ký tự' });
    }

    if (input.ward_user_address !== undefined && input.ward_user_address !== null && !requiredString(input.ward_user_address, 1, 100)) {
        errors.push({ field: 'ward_user_address', message: 'Phường/Xã không hợp lệ' });
    }
    if (input.district_user_address !== undefined && input.district_user_address !== null && !requiredString(input.district_user_address, 1, 100)) {
        errors.push({ field: 'district_user_address', message: 'Quận/Huyện không hợp lệ' });
    }
    if (input.province_user_address !== undefined && input.province_user_address !== null && !requiredString(input.province_user_address, 1, 100)) {
        errors.push({ field: 'province_user_address', message: 'Tỉnh/Thành phố không hợp lệ' });
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            receiver_name_user_address: input.receiver_name_user_address.trim(),
            phone_user_address: normalizedPhone || (typeof input.phone_user_address === 'string' ? input.phone_user_address.trim() : ''),
            address_line_user_address: input.address_line_user_address.trim(),
            ward_user_address: input.ward_user_address ? input.ward_user_address.trim() : null,
            district_user_address: input.district_user_address ? input.district_user_address.trim() : null,
            province_user_address: input.province_user_address ? input.province_user_address.trim() : null,
            is_default: Boolean(input.is_default),
        },
    };
};

export const validateUpdateAddress = (input = {}) => {
    const errors = [];
    const forbiddenFields = ['user_address_id', 'user_id', 'created_at', 'updated_at', 'is_default'];
    for (const field of forbiddenFields) {
        if (field in input) {
            errors.push({ field, message: `Không được phép cập nhật trường ${field}` });
        }
    }

    const value = {};
    if (input.receiver_name_user_address !== undefined) {
        if (!requiredString(input.receiver_name_user_address, 2, 100)) {
            errors.push({ field: 'receiver_name_user_address', message: 'Tên người nhận phải từ 2 đến 100 ký tự' });
        } else {
            value.receiver_name_user_address = input.receiver_name_user_address.trim();
        }
    }

    if (input.phone_user_address !== undefined) {
        const normalized = normalizePhone(input.phone_user_address);
        if (!normalized) {
            errors.push({ field: 'phone_user_address', message: 'Số điện thoại người nhận phải gồm 10 chữ số hợp lệ (bắt đầu bằng 0 hoặc +84)' });
        } else {
            value.phone_user_address = normalized;
        }
    }

    if (input.address_line_user_address !== undefined) {
        if (!requiredString(input.address_line_user_address, 5, 255)) {
            errors.push({ field: 'address_line_user_address', message: 'Địa chỉ chi tiết phải từ 5 đến 255 ký tự' });
        } else {
            value.address_line_user_address = input.address_line_user_address.trim();
        }
    }

    if (input.ward_user_address !== undefined) {
        if (input.ward_user_address !== null && !requiredString(input.ward_user_address, 1, 100)) {
            errors.push({ field: 'ward_user_address', message: 'Phường/Xã không hợp lệ' });
        } else {
            value.ward_user_address = input.ward_user_address ? input.ward_user_address.trim() : null;
        }
    }

    if (input.district_user_address !== undefined) {
        if (input.district_user_address !== null && !requiredString(input.district_user_address, 1, 100)) {
            errors.push({ field: 'district_user_address', message: 'Quận/Huyện không hợp lệ' });
        } else {
            value.district_user_address = input.district_user_address ? input.district_user_address.trim() : null;
        }
    }

    if (input.province_user_address !== undefined) {
        if (input.province_user_address !== null && !requiredString(input.province_user_address, 1, 100)) {
            errors.push({ field: 'province_user_address', message: 'Tỉnh/Thành phố không hợp lệ' });
        } else {
            value.province_user_address = input.province_user_address ? input.province_user_address.trim() : null;
        }
    }

    if (errors.length) return { ok: false, errors };
    return { ok: true, value };
};

export const validateProductQuery = (input = {}) => {
    const errors = [];
    let page = 1;
    if (input.page !== undefined && input.page !== null && input.page !== '') {
        const p = Number.parseInt(input.page, 10);
        if (isNaN(p) || p < 1) {
            errors.push({ field: 'page', message: 'Page phải là số nguyên >= 1' });
        } else {
            page = p;
        }
    }

    let limit = 20;
    if (input.limit !== undefined && input.limit !== null && input.limit !== '') {
        const l = Number.parseInt(input.limit, 10);
        if (isNaN(l) || l < 1 || l > 100) {
            errors.push({ field: 'limit', message: 'Limit phải là số nguyên từ 1 đến 100' });
        } else {
            limit = l;
        }
    }

    let search = undefined;
    if (input.search !== undefined && input.search !== null && input.search !== '') {
        if (typeof input.search !== 'string') {
            errors.push({ field: 'search', message: 'Search query phải là chuỗi' });
        } else {
            search = input.search.trim();
        }
    }

    let categoryId = undefined;
    if (input.category_id !== undefined && input.category_id !== null && input.category_id !== '') {
        const catId = Number.parseInt(input.category_id, 10);
        if (isNaN(catId) || catId < 1) {
            errors.push({ field: 'category_id', message: 'Category ID phải là số nguyên >= 1' });
        } else {
            categoryId = catId;
        }
    }

    let categorySlug = undefined;
    if (input.category !== undefined && input.category !== null && input.category !== '') {
        if (typeof input.category !== 'string' || !input.category.trim()) {
            errors.push({ field: 'category', message: 'Category slug phải là chuỗi hợp lệ' });
        } else {
            categorySlug = input.category.trim().toLowerCase();
        }
    }

    let collectionId = undefined;
    if (input.collection_id !== undefined && input.collection_id !== null && input.collection_id !== '') {
        const colId = Number.parseInt(input.collection_id, 10);
        if (isNaN(colId) || colId < 1) {
            errors.push({ field: 'collection_id', message: 'Collection ID phải là số nguyên >= 1' });
        } else {
            collectionId = colId;
        }
    }

    let collectionSlug = undefined;
    if (input.collection !== undefined && input.collection !== null && input.collection !== '') {
        if (typeof input.collection !== 'string' || !input.collection.trim()) {
            errors.push({ field: 'collection', message: 'Collection slug phải là chuỗi hợp lệ' });
        } else {
            collectionSlug = input.collection.trim().toLowerCase();
        }
    }

    let minPrice = undefined;
    if (input.min_price !== undefined && input.min_price !== null && input.min_price !== '') {
        const minP = Number.parseFloat(input.min_price);
        if (isNaN(minP) || minP < 0) {
            errors.push({ field: 'min_price', message: 'Min price phải là số >= 0' });
        } else {
            minPrice = minP;
        }
    }

    let maxPrice = undefined;
    if (input.max_price !== undefined && input.max_price !== null && input.max_price !== '') {
        const maxP = Number.parseFloat(input.max_price);
        if (isNaN(maxP) || maxP < 0) {
            errors.push({ field: 'max_price', message: 'Max price phải là số >= 0' });
        } else {
            maxPrice = maxP;
        }
    }

    if (minPrice !== undefined && maxPrice !== undefined && maxPrice < minPrice) {
        errors.push({ field: 'max_price', message: 'Max price phải lớn hơn hoặc bằng min price' });
    }

    const allowedSorts = ['newest', 'oldest', 'price_asc', 'price_desc', 'name_asc', 'name_desc'];
    let sort = 'newest';
    if (input.sort !== undefined && input.sort !== null && input.sort !== '') {
        if (!allowedSorts.includes(input.sort)) {
            errors.push({ field: 'sort', message: `Sort phải là một trong các giá trị: ${allowedSorts.join(', ')}` });
        } else {
            sort = input.sort;
        }
    }

    let statusProduct = undefined;
    if (input.status_product !== undefined && input.status_product !== null && input.status_product !== '') {
        if (!PRODUCT_STATUSES.includes(input.status_product)) {
            errors.push({ field: 'status_product', message: 'status_product phải là draft, active hoặc archived' });
        } else {
            statusProduct = input.status_product;
        }
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            page,
            limit,
            search,
            category_id: categoryId,
            category_slug: categorySlug,
            collection_id: collectionId,
            collection_slug: collectionSlug,
            min_price: minPrice,
            max_price: maxPrice,
            sort,
            status_product: statusProduct,
        },
    };
};

export const validateCreateProduct = (input = {}) => {
    const errors = [];
    const forbiddenFields = ['product_id', 'created_at', 'updated_at'];
    for (const field of forbiddenFields) {
        if (field in input) {
            errors.push({ field, message: `Không được phép truyền trường ${field}` });
        }
    }

    if (!requiredString(input.name_product, 2, 255)) {
        errors.push({ field: 'name_product', message: 'Tên sản phẩm bắt buộc từ 2 đến 255 ký tự' });
    }

    if (input.description !== undefined && input.description !== null && typeof input.description !== 'string') {
        errors.push({ field: 'description', message: 'Mô tả phải là chuỗi' });
    }

    let statusProduct = 'draft';
    if (input.status_product !== undefined && input.status_product !== null) {
        if (!['draft', 'active', 'archived'].includes(input.status_product)) {
            errors.push({ field: 'status_product', message: 'Trạng thái sản phẩm không hợp lệ' });
        } else {
            statusProduct = input.status_product;
        }
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            name_product: input.name_product.trim(),
            description: input.description !== undefined && input.description !== null ? input.description.trim() : null,
            status_product: statusProduct,
        },
    };
};

export const validateCreateFullProduct = (input = {}) => {
    const errors = [];
    const baseResult = validateCreateProduct(input);
    if (!baseResult.ok) errors.push(...baseResult.errors);

    const optionNames = new Map();
    const normalizedOptions = [];
    if (!Array.isArray(input.options) || input.options.length === 0) {
        errors.push({ field: 'options', message: 'options phải là mảng không rỗng' });
    } else {
        input.options.forEach((option, optionIndex) => {
            const field = `options[${optionIndex}]`;
            if (!option || !requiredString(option.name_option, 1, 100)) {
                errors.push({ field: `${field}.name_option`, message: 'Tên option bắt buộc từ 1 đến 100 ký tự' });
                return;
            }
            const name = option.name_option.trim();
            const nameKey = name.toLowerCase();
            if (optionNames.has(nameKey)) {
                errors.push({ field: `${field}.name_option`, message: 'Tên option không được trùng nhau' });
            }

            const values = [];
            const valueKeys = new Set();
            if (!Array.isArray(option.values) || option.values.length === 0) {
                errors.push({ field: `${field}.values`, message: 'Mỗi option phải có ít nhất một giá trị' });
            } else {
                option.values.forEach((rawValue, valueIndex) => {
                    if (!requiredString(rawValue, 1, 100)) {
                        errors.push({ field: `${field}.values[${valueIndex}]`, message: 'Giá trị option phải từ 1 đến 100 ký tự' });
                        return;
                    }
                    const value = rawValue.trim();
                    const valueKey = value.toLowerCase();
                    if (valueKeys.has(valueKey)) {
                        errors.push({ field: `${field}.values[${valueIndex}]`, message: 'Giá trị trong cùng option không được trùng nhau' });
                        return;
                    }
                    valueKeys.add(valueKey);
                    values.push(value);
                });
            }
            optionNames.set(nameKey, { name, valueKeys });
            normalizedOptions.push({ name_option: name, values });
        });
    }

    const normalizedVariants = [];
    const skuKeys = new Set();
    const combinationKeys = new Set();
    if (!Array.isArray(input.variants) || input.variants.length === 0) {
        errors.push({ field: 'variants', message: 'variants phải là mảng không rỗng' });
    } else {
        input.variants.forEach((variant, variantIndex) => {
            const field = `variants[${variantIndex}]`;
            if (!variant || !requiredString(variant.sku, 1, 100)) {
                errors.push({ field: `${field}.sku`, message: 'SKU bắt buộc từ 1 đến 100 ký tự' });
            }
            const sku = typeof variant?.sku === 'string' ? variant.sku.trim().toUpperCase() : '';
            if (sku && skuKeys.has(sku)) errors.push({ field: `${field}.sku`, message: 'SKU không được trùng nhau' });
            skuKeys.add(sku);

            const price = Number(variant?.price);
            if (!Number.isSafeInteger(price) || price < 0) {
                errors.push({ field: `${field}.price`, message: 'price phải là số nguyên an toàn >= 0' });
            }
            const quantityStock = Number(variant?.quantity_stock ?? 0);
            if (!Number.isSafeInteger(quantityStock) || quantityStock < 0) {
                errors.push({ field: `${field}.quantity_stock`, message: 'quantity_stock phải là số nguyên >= 0' });
            }
            const salePrice = variant?.sale_price === undefined || variant?.sale_price === null || variant?.sale_price === ''
                ? null
                : Number(variant.sale_price);
            if (salePrice !== null && (!Number.isSafeInteger(salePrice) || salePrice < 0)) {
                errors.push({ field: `${field}.sale_price`, message: 'sale_price phải là số nguyên >= 0 hoặc null' });
            }

            const optionValues = {};
            if (!variant?.option_values || Array.isArray(variant.option_values) || typeof variant.option_values !== 'object') {
                errors.push({ field: `${field}.option_values`, message: 'option_values phải là object theo dạng {"Color":"Black"}' });
            } else {
                const suppliedKeys = Object.keys(variant.option_values).map((key) => key.trim().toLowerCase());
                for (const [nameKey, option] of optionNames.entries()) {
                    const suppliedName = Object.keys(variant.option_values).find((key) => key.trim().toLowerCase() === nameKey);
                    const suppliedValue = suppliedName ? variant.option_values[suppliedName] : undefined;
                    if (!requiredString(suppliedValue, 1, 100) || !option.valueKeys.has(suppliedValue.trim().toLowerCase())) {
                        errors.push({ field: `${field}.option_values.${option.name}`, message: `Giá trị không hợp lệ cho option ${option.name}` });
                    } else {
                        optionValues[option.name] = suppliedValue.trim();
                    }
                }
                if (suppliedKeys.some((key) => !optionNames.has(key))) {
                    errors.push({ field: `${field}.option_values`, message: 'option_values chứa option không tồn tại' });
                }
            }
            const combinationKey = normalizedOptions.map((option) => `${option.name_option.toLowerCase()}:${String(optionValues[option.name_option] || '').toLowerCase()}`).join('|');
            if (combinationKey && combinationKeys.has(combinationKey)) {
                errors.push({ field: `${field}.option_values`, message: 'Tổ hợp option của variant không được trùng nhau' });
            }
            combinationKeys.add(combinationKey);
            normalizedVariants.push({
                sku,
                price,
                sale_price: salePrice,
                sale_start_at: variant?.sale_start_at || null,
                sale_end_at: variant?.sale_end_at || null,
                quantity_stock: quantityStock,
                option_values: optionValues,
            });
        });
    }

    const normalizedCategoryIds = [];
    if (input.category_ids !== undefined && input.category_ids !== null) {
        if (!Array.isArray(input.category_ids)) {
            errors.push({ field: 'category_ids', message: 'category_ids phải là mảng' });
        } else {
            input.category_ids.forEach((id, index) => {
                const value = Number(id);
                if (!Number.isSafeInteger(value) || value <= 0) errors.push({ field: `category_ids[${index}]`, message: 'category_id phải là số nguyên dương' });
                else normalizedCategoryIds.push(value);
            });
            if (new Set(normalizedCategoryIds).size !== normalizedCategoryIds.length) errors.push({ field: 'category_ids', message: 'category_ids không được trùng nhau' });
        }
    }

    let primaryCategoryId = null;
    const rawPrimary = input.primary_category_id ?? input.category_id;
    if (rawPrimary !== undefined && rawPrimary !== null && rawPrimary !== '') {
        const parsed = Number(rawPrimary);
        if (!Number.isSafeInteger(parsed) || parsed <= 0) {
            errors.push({ field: 'primary_category_id', message: 'primary_category_id phải là số nguyên dương' });
        } else {
            primaryCategoryId = parsed;
            if (!normalizedCategoryIds.includes(primaryCategoryId)) {
                normalizedCategoryIds.push(primaryCategoryId);
            }
        }
    } else if (normalizedCategoryIds.length > 0) {
        primaryCategoryId = normalizedCategoryIds[0];
    }

    if (normalizedCategoryIds.length === 0 && !errors.some(e => e.field.includes('category'))) {
        errors.push({ field: 'primary_category_id', message: 'Vui lòng chọn danh mục chính cho sản phẩm' });
    }

    const normalizedCollectionIds = [];
    if (input.collection_ids !== undefined) {
        if (!Array.isArray(input.collection_ids)) {
            errors.push({ field: 'collection_ids', message: 'collection_ids phải là mảng' });
        } else {
            input.collection_ids.forEach((id, index) => {
                const value = Number(id);
                if (!Number.isSafeInteger(value) || value <= 0) errors.push({ field: `collection_ids[${index}]`, message: 'collection_id phải là số nguyên dương' });
                else normalizedCollectionIds.push(value);
            });
            if (new Set(normalizedCollectionIds).size !== normalizedCollectionIds.length) errors.push({ field: 'collection_ids', message: 'collection_ids không được trùng nhau' });
        }
    }

    const normalizedImages = [];
    if (input.images !== undefined) {
        if (!Array.isArray(input.images)) errors.push({ field: 'images', message: 'images phải là mảng' });
        else input.images.forEach((image, imageIndex) => {
            const imageResult = validateCreateProductImage(image || {});
            if (!imageResult.ok) {
                imageResult.errors.forEach((error) => errors.push({ ...error, field: `images[${imageIndex}].${error.field}` }));
                return;
            }
            let optionValue = null;
            if (image.option_value !== undefined && image.option_value !== null) {
                const ref = image.option_value;
                if (!ref || !requiredString(ref.option_name, 1, 100) || !requiredString(ref.value, 1, 100)) {
                    errors.push({ field: `images[${imageIndex}].option_value`, message: 'option_value phải có option_name và value' });
                } else {
                    const option = optionNames.get(ref.option_name.trim().toLowerCase());
                    if (!option || !option.valueKeys.has(ref.value.trim().toLowerCase())) errors.push({ field: `images[${imageIndex}].option_value`, message: 'Option value gắn với ảnh không tồn tại' });
                    else optionValue = { option_name: option.name, value: ref.value.trim() };
                }
            }
            normalizedImages.push({ ...imageResult.value, option_value: optionValue });
        });
    }

    if (errors.length) return { ok: false, errors };
    return { ok: true, value: { ...baseResult.value, options: normalizedOptions, variants: normalizedVariants, images: normalizedImages, category_ids: normalizedCategoryIds, primary_category_id: primaryCategoryId, collection_ids: normalizedCollectionIds } };
};

export const validateUpdateFullProduct = (input = {}) => {
    const sanitized = {
        ...input,
        variants: Array.isArray(input.variants)
            ? input.variants.map(({ product_variant_id, ...variant }) => variant)
            : input.variants,
        images: Array.isArray(input.images)
            ? input.images.map(({ product_image_id, ...image }) => image)
            : input.images,
    };
    const result = validateCreateFullProduct(sanitized);
    if (!result.ok) return result;

    const errors = [];
    const variants = result.value.variants.map((variant, index) => {
        const rawId = input.variants[index]?.product_variant_id;
        if (rawId === undefined || rawId === null || rawId === '') return variant;
        const id = Number(rawId);
        if (!Number.isSafeInteger(id) || id <= 0) {
            errors.push({ field: `variants[${index}].product_variant_id`, message: 'product_variant_id phải là số nguyên dương' });
        }
        return { ...variant, product_variant_id: id };
    });
    const images = result.value.images.map((image, index) => {
        const rawId = input.images[index]?.product_image_id;
        if (rawId === undefined || rawId === null || rawId === '') return image;
        const id = Number(rawId);
        if (!Number.isSafeInteger(id) || id <= 0) {
            errors.push({ field: `images[${index}].product_image_id`, message: 'product_image_id phải là số nguyên dương' });
        }
        return { ...image, product_image_id: id };
    });

    if (errors.length) return { ok: false, errors };
    return { ok: true, value: { ...result.value, variants, images } };
};

export const validateUpdateProduct = (input = {}) => {
    const errors = [];
    const forbiddenFields = ['product_id', 'created_at', 'updated_at'];
    for (const field of forbiddenFields) {
        if (field in input) {
            errors.push({ field, message: `Không được phép cập nhật trường ${field}` });
        }
    }

    const value = {};
    if (input.name_product !== undefined) {
        if (!requiredString(input.name_product, 2, 255)) {
            errors.push({ field: 'name_product', message: 'Tên sản phẩm phải từ 2 đến 255 ký tự' });
        } else {
            value.name_product = input.name_product.trim();
        }
    }

    if (input.description !== undefined) {
        if (input.description !== null && typeof input.description !== 'string') {
            errors.push({ field: 'description', message: 'Mô tả phải là chuỗi' });
        } else {
            value.description = input.description ? input.description.trim() : null;
        }
    }

    if (errors.length) return { ok: false, errors };

    return { ok: true, value };
};

export const validateCreateProductOption = (input = {}) => {
    const errors = [];
    const forbiddenFields = ['product_option_id', 'product_id', 'created_at', 'updated_at'];
    for (const field of forbiddenFields) {
        if (field in input) {
            errors.push({ field, message: `Không được phép truyền trường ${field}` });
        }
    }

    if (!requiredString(input.name_option, 1, 100)) {
        errors.push({ field: 'name_option', message: 'Tên Option bắt buộc từ 1 đến 100 ký tự' });
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            name_option: input.name_option.trim(),
        },
    };
};

export const validateUpdateProductOption = (input = {}) => {
    const errors = [];
    const forbiddenFields = ['product_option_id', 'product_id', 'created_at', 'updated_at'];
    for (const field of forbiddenFields) {
        if (field in input) {
            errors.push({ field, message: `Không được phép cập nhật trường ${field}` });
        }
    }

    if (input.name_option === undefined || !requiredString(input.name_option, 1, 100)) {
        errors.push({ field: 'name_option', message: 'Tên Option bắt buộc từ 1 đến 100 ký tự' });
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            name_option: input.name_option.trim(),
        },
    };
};

export const validateCreateOptionValue = (input = {}) => {
    const errors = [];
    const forbiddenFields = ['product_option_value_id', 'product_option_id', 'created_at', 'updated_at'];
    for (const field of forbiddenFields) {
        if (field in input) {
            errors.push({ field, message: `Không được phép truyền trường ${field}` });
        }
    }

    if (!requiredString(input.value_option, 1, 100)) {
        errors.push({ field: 'value_option', message: 'Giá trị Option bắt buộc từ 1 đến 100 ký tự' });
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            value_option: input.value_option.trim(),
        },
    };
};

export const validateUpdateOptionValue = (input = {}) => {
    const errors = [];
    const forbiddenFields = ['product_option_value_id', 'product_option_id', 'created_at', 'updated_at'];
    for (const field of forbiddenFields) {
        if (field in input) {
            errors.push({ field, message: `Không được phép cập nhật trường ${field}` });
        }
    }

    if (input.value_option === undefined || !requiredString(input.value_option, 1, 100)) {
        errors.push({ field: 'value_option', message: 'Giá trị Option bắt buộc từ 1 đến 100 ký tự' });
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            value_option: input.value_option.trim(),
        },
    };
};

export const validateCreateVariant = (input = {}) => {
    const errors = [];
    const forbiddenFields = ['product_variant_id', 'product_id', 'created_at', 'updated_at'];
    for (const field of forbiddenFields) {
        if (field in input) {
            errors.push({ field, message: `Không được phép truyền trường ${field}` });
        }
    }

    if (!requiredString(input.sku, 1, 100)) {
        errors.push({ field: 'sku', message: 'SKU bắt buộc từ 1 đến 100 ký tự' });
    }

    let price = undefined;
    if (input.price === undefined || input.price === null || input.price === '') {
        errors.push({ field: 'price', message: 'Price không được để trống' });
    } else {
        const numPrice = Number(input.price);
        if (isNaN(numPrice) || numPrice < 0) {
            errors.push({ field: 'price', message: 'Price phải là số >= 0' });
        } else {
            price = numPrice;
        }
    }

    let optionValueIds = [];
    if (!Array.isArray(input.option_value_ids)) {
        errors.push({ field: 'option_value_ids', message: 'option_value_ids phải là mảng không rỗng' });
    } else {
        for (const id of input.option_value_ids) {
            const numId = Number(id);
            if (!Number.isSafeInteger(numId) || numId <= 0) {
                errors.push({ field: 'option_value_ids', message: 'Mỗi option_value_id phải là số nguyên dương' });
                break;
            }
            optionValueIds.push(numId);
        }
        if (new Set(optionValueIds).size !== optionValueIds.length) {
            errors.push({ field: 'option_value_ids', message: 'option_value_ids không được chứa giá trị trùng nhau' });
        }
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            sku: input.sku.trim().toUpperCase(),
            price,
            option_value_ids: optionValueIds,
        },
    };
};

export const validateUpdateVariant = (input = {}) => {
    const errors = [];
    const forbiddenFields = ['product_variant_id', 'product_id', 'created_at', 'updated_at'];
    for (const field of forbiddenFields) {
        if (field in input) {
            errors.push({ field, message: `Không được phép cập nhật trường ${field}` });
        }
    }

    const value = {};
    if (input.sku !== undefined) {
        if (!requiredString(input.sku, 1, 100)) {
            errors.push({ field: 'sku', message: 'SKU phải từ 1 đến 100 ký tự' });
        } else {
            value.sku = input.sku.trim().toUpperCase();
        }
    }

    if (input.price !== undefined) {
        const numPrice = Number(input.price);
        if (isNaN(numPrice) || numPrice < 0) {
            errors.push({ field: 'price', message: 'Price phải là số >= 0' });
        } else {
            value.price = numPrice;
        }
    }

    if (input.option_value_ids !== undefined) {
        if (!Array.isArray(input.option_value_ids)) {
            errors.push({ field: 'option_value_ids', message: 'option_value_ids phải là mảng không rỗng' });
        } else {
            const optionValueIds = [];
            for (const id of input.option_value_ids) {
                const numId = Number(id);
                if (!Number.isSafeInteger(numId) || numId <= 0) {
                    errors.push({ field: 'option_value_ids', message: 'Mỗi option_value_id phải là số nguyên dương' });
                    break;
                }
                optionValueIds.push(numId);
            }
            if (new Set(optionValueIds).size !== optionValueIds.length) {
                errors.push({ field: 'option_value_ids', message: 'option_value_ids không được chứa giá trị trùng nhau' });
            } else {
                value.option_value_ids = optionValueIds;
            }
        }
    }

    if (Object.keys(value).length === 0 && errors.length === 0) {
        errors.push({ field: 'body', message: 'Cần cung cấp ít nhất một trường để cập nhật' });
    }

    if (errors.length) return { ok: false, errors };

    return { ok: true, value };
};

export const validateCreateProductImage = (input = {}) => {
    const errors = [];
    const forbiddenFields = ['product_image_id', 'product_id', 'created_at', 'updated_at'];
    for (const field of forbiddenFields) {
        if (field in input) {
            errors.push({ field, message: `Không được phép truyền trường ${field}` });
        }
    }

    if (!requiredString(input.url_product_image, 1, 1000) || /^javascript:/i.test(input.url_product_image.trim())) {
        errors.push({ field: 'url_product_image', message: 'URL hình ảnh bắt buộc từ 1 đến 1000 ký tự và phải hợp lệ' });
    }

    let optionValueId = null;
    if (input.product_option_value_id !== undefined && input.product_option_value_id !== null) {
        const numId = Number(input.product_option_value_id);
        if (!Number.isSafeInteger(numId) || numId <= 0) {
            errors.push({ field: 'product_option_value_id', message: 'product_option_value_id phải là số nguyên dương hoặc null' });
        } else {
            optionValueId = numId;
        }
    }

    let alt = null;
    if (input.alt_product_image !== undefined && input.alt_product_image !== null) {
        if (!isString(input.alt_product_image) || input.alt_product_image.trim().length > 255) {
            errors.push({ field: 'alt_product_image', message: 'alt_product_image phải là chuỗi không quá 255 ký tự' });
        } else {
            alt = input.alt_product_image.trim();
        }
    }

    let position = undefined;
    if (input.position_product_image !== undefined && input.position_product_image !== null) {
        const numPos = Number(input.position_product_image);
        if (!Number.isSafeInteger(numPos) || numPos < 0) {
            errors.push({ field: 'position_product_image', message: 'position_product_image phải là số nguyên >= 0' });
        } else {
            position = numPos;
        }
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            url_product_image: input.url_product_image.trim(),
            product_option_value_id: optionValueId,
            alt_product_image: alt,
            position_product_image: position,
        },
    };
};

export const validateUpdateProductImage = (input = {}) => {
    const errors = [];
    const forbiddenFields = ['product_image_id', 'product_id', 'created_at', 'updated_at'];
    for (const field of forbiddenFields) {
        if (field in input) {
            errors.push({ field, message: `Không được phép cập nhật trường ${field}` });
        }
    }

    const value = {};
    if (input.url_product_image !== undefined) {
        if (!requiredString(input.url_product_image, 1, 1000) || /^javascript:/i.test(input.url_product_image.trim())) {
            errors.push({ field: 'url_product_image', message: 'URL hình ảnh phải từ 1 đến 1000 ký tự và hợp lệ' });
        } else {
            value.url_product_image = input.url_product_image.trim();
        }
    }

    if (input.product_option_value_id !== undefined) {
        if (input.product_option_value_id === null) {
            value.product_option_value_id = null;
        } else {
            const numId = Number(input.product_option_value_id);
            if (!Number.isSafeInteger(numId) || numId <= 0) {
                errors.push({ field: 'product_option_value_id', message: 'product_option_value_id phải là số nguyên dương hoặc null' });
            } else {
                value.product_option_value_id = numId;
            }
        }
    }

    if (input.alt_product_image !== undefined) {
        if (input.alt_product_image === null) {
            value.alt_product_image = null;
        } else if (!isString(input.alt_product_image) || input.alt_product_image.trim().length > 255) {
            errors.push({ field: 'alt_product_image', message: 'alt_product_image phải là chuỗi không quá 255 ký tự' });
        } else {
            value.alt_product_image = input.alt_product_image.trim();
        }
    }

    if (input.position_product_image !== undefined) {
        const numPos = Number(input.position_product_image);
        if (!Number.isSafeInteger(numPos) || numPos < 0) {
            errors.push({ field: 'position_product_image', message: 'position_product_image phải là số nguyên >= 0' });
        } else {
            value.position_product_image = numPos;
        }
    }

    if (Object.keys(value).length === 0 && errors.length === 0) {
        errors.push({ field: 'body', message: 'Cần cung cấp ít nhất một trường để cập nhật' });
    }

    if (errors.length) return { ok: false, errors };

    return { ok: true, value };
};

export const validateReorderProductImages = (input = {}) => {
    const errors = [];
    if (!input || !Array.isArray(input.images) || input.images.length === 0) {
        errors.push({ field: 'images', message: 'images phải là mảng không rỗng' });
        return { ok: false, errors };
    }

    const seenIds = new Set();
    const validatedImages = [];

    for (const item of input.images) {
        if (!item || typeof item !== 'object') {
            errors.push({ field: 'images', message: 'Mỗi phần tử trong images phải là object' });
            break;
        }

        const imageId = Number(item.product_image_id);
        if (!Number.isSafeInteger(imageId) || imageId <= 0) {
            errors.push({ field: 'product_image_id', message: 'product_image_id phải là số nguyên dương' });
            break;
        }

        if (seenIds.has(imageId)) {
            errors.push({ field: 'product_image_id', message: 'product_image_id không được trùng lặp trong danh sách reorder' });
            break;
        }
        seenIds.add(imageId);

        const pos = Number(item.position_product_image);
        if (!Number.isSafeInteger(pos) || pos < 0) {
            errors.push({ field: 'position_product_image', message: 'position_product_image phải là số nguyên >= 0' });
            break;
        }

        validatedImages.push({
            product_image_id: imageId,
            position_product_image: pos,
        });
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            images: validatedImages,
        },
    };
};

export const validateCreateCategory = (input = {}) => {
    const errors = [];
    const forbiddenFields = ['category_id', 'created_at', 'updated_at'];
    for (const field of forbiddenFields) {
        if (field in input) {
            errors.push({ field, message: `Không được phép truyền trường ${field}` });
        }
    }

    if (!requiredString(input.name_category, 1, 255)) {
        errors.push({ field: 'name_category', message: 'Tên danh mục bắt buộc từ 1 đến 255 ký tự' });
    }

    let slug = undefined;
    if (input.slug_category !== undefined && input.slug_category !== null && input.slug_category !== '') {
        if (!isString(input.slug_category) || input.slug_category.trim().length > 255) {
            errors.push({ field: 'slug_category', message: 'Slug danh mục phải là chuỗi không quá 255 ký tự' });
        } else {
            slug = slugify(input.slug_category);
        }
    } else if (input.name_category && isString(input.name_category)) {
        slug = slugify(input.name_category);
    }

    let parentId = null;
    if (input.parent_category_id !== undefined && input.parent_category_id !== null && input.parent_category_id !== '') {
        const numId = Number(input.parent_category_id);
        if (!Number.isSafeInteger(numId) || numId <= 0) {
            errors.push({ field: 'parent_category_id', message: 'parent_category_id phải là số nguyên dương hoặc null' });
        } else {
            parentId = numId;
        }
    }

    let description = null;
    if (input.description_category !== undefined && input.description_category !== null) {
        if (!isString(input.description_category)) {
            errors.push({ field: 'description_category', message: 'Mô tả danh mục phải là chuỗi' });
        } else {
            description = input.description_category.trim();
        }
    }

    let position = 0;
    if (input.position_category !== undefined && input.position_category !== null && input.position_category !== '') {
        const numPos = Number(input.position_category);
        if (!Number.isSafeInteger(numPos) || numPos < 0) {
            errors.push({ field: 'position_category', message: 'position_category phải là số nguyên >= 0' });
        } else {
            position = numPos;
        }
    }

    let isActive = true;
    if (input.is_active !== undefined) {
        if (!isBoolean(input.is_active)) {
            errors.push({ field: 'is_active', message: 'is_active phải là boolean' });
        } else {
            isActive = input.is_active;
        }
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            name_category: input.name_category.trim(),
            slug_category: slug,
            parent_category_id: parentId,
            description_category: description,
            position_category: position,
            is_active: isActive,
        },
    };
};

export const validateUpdateCategory = (input = {}) => {
    const errors = [];
    const forbiddenFields = ['category_id', 'created_at', 'updated_at'];
    for (const field of forbiddenFields) {
        if (field in input) {
            errors.push({ field, message: `Không được phép cập nhật trường ${field}` });
        }
    }

    const value = {};
    if (input.name_category !== undefined) {
        if (!requiredString(input.name_category, 1, 255)) {
            errors.push({ field: 'name_category', message: 'Tên danh mục phải từ 1 đến 255 ký tự' });
        } else {
            value.name_category = input.name_category.trim();
        }
    }

    if (input.slug_category !== undefined) {
        if (input.slug_category === null || !isString(input.slug_category) || input.slug_category.trim().length === 0 || input.slug_category.trim().length > 255) {
            errors.push({ field: 'slug_category', message: 'Slug danh mục phải là chuỗi từ 1 đến 255 ký tự' });
        } else {
            value.slug_category = slugify(input.slug_category);
        }
    }

    if (input.parent_category_id !== undefined) {
        if (input.parent_category_id === null || input.parent_category_id === '') {
            value.parent_category_id = null;
        } else {
            const numId = Number(input.parent_category_id);
            if (!Number.isSafeInteger(numId) || numId <= 0) {
                errors.push({ field: 'parent_category_id', message: 'parent_category_id phải là số nguyên dương hoặc null' });
            } else {
                value.parent_category_id = numId;
            }
        }
    }

    if (input.description_category !== undefined) {
        if (input.description_category === null) {
            value.description_category = null;
        } else if (!isString(input.description_category)) {
            errors.push({ field: 'description_category', message: 'Mô tả danh mục phải là chuỗi' });
        } else {
            value.description_category = input.description_category.trim();
        }
    }

    if (input.position_category !== undefined) {
        const numPos = Number(input.position_category);
        if (!Number.isSafeInteger(numPos) || numPos < 0) {
            errors.push({ field: 'position_category', message: 'position_category phải là số nguyên >= 0' });
        } else {
            value.position_category = numPos;
        }
    }

    if (input.is_active !== undefined) {
        if (!isBoolean(input.is_active)) {
            errors.push({ field: 'is_active', message: 'is_active phải là boolean' });
        } else {
            value.is_active = input.is_active;
        }
    }

    if (Object.keys(value).length === 0 && errors.length === 0) {
        errors.push({ field: 'body', message: 'Cần cung cấp ít nhất một trường để cập nhật' });
    }

    if (errors.length) return { ok: false, errors };

    return { ok: true, value };
};

export const validateUpdateCategoryStatus = (input = {}) => {
    const errors = [];
    if (input.is_active === undefined || !isBoolean(input.is_active)) {
        errors.push({ field: 'is_active', message: 'is_active là bắt buộc và phải là boolean' });
    }

    if (errors.length) return { ok: false, errors };
    return { ok: true, value: { is_active: input.is_active } };
};

export const validateAssignProductCategory = (input = {}) => {
    const errors = [];
    if (!input || typeof input !== 'object') {
        errors.push({ field: 'body', message: 'Dữ liệu không hợp lệ' });
        return { ok: false, errors };
    }

    // Support batch assignment: { categories: [{ category_id, is_primary }] }
    if (Array.isArray(input.categories)) {
        if (input.categories.length === 0) {
            errors.push({ field: 'categories', message: 'categories không được rỗng' });
            return { ok: false, errors };
        }
        const validated = [];
        const seen = new Set();
        let primaryCount = 0;

        for (const item of input.categories) {
            if (!item || typeof item !== 'object') {
                errors.push({ field: 'categories', message: 'Mỗi phần tử phải là object' });
                break;
            }
            const catId = Number(item.category_id);
            if (!Number.isSafeInteger(catId) || catId <= 0) {
                errors.push({ field: 'category_id', message: 'category_id phải là số nguyên dương' });
                break;
            }
            if (seen.has(catId)) {
                errors.push({ field: 'category_id', message: 'category_id bị trùng lặp trong danh sách gán' });
                break;
            }
            seen.add(catId);
            const isPrimary = Boolean(item.is_primary);
            if (isPrimary) primaryCount++;

            validated.push({
                category_id: catId,
                is_primary: isPrimary,
            });
        }

        if (primaryCount > 1) {
            errors.push({ field: 'is_primary', message: 'Chỉ được phép chọn tối đa một danh mục chính (is_primary = true)' });
        }

        if (errors.length) return { ok: false, errors };
        return { ok: true, value: { categories: validated } };
    }

    // Support single assignment: { category_id, is_primary }
    const catId = Number(input.category_id);
    if (!Number.isSafeInteger(catId) || catId <= 0) {
        errors.push({ field: 'category_id', message: 'category_id bắt buộc và phải là số nguyên dương' });
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            category_id: catId,
            is_primary: Boolean(input.is_primary),
        },
    };
};

export const validateCreateCollection = (input = {}) => {
    const errors = [];
    if (!input || typeof input !== 'object') {
        errors.push({ field: 'body', message: 'Dữ liệu không hợp lệ' });
        return { ok: false, errors };
    }
    const forbiddenFields = ['collection_id', 'created_at', 'updated_at'];
    for (const field of forbiddenFields) {
        if (field in input) {
            errors.push({ field, message: `Không được phép truyền trường ${field}` });
        }
    }

    let parentCollectionId = null;
    if (input.parent_collection_id !== undefined && input.parent_collection_id !== null && input.parent_collection_id !== '') {
        const id = Number(input.parent_collection_id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            errors.push({ field: 'parent_collection_id', message: 'Nhóm bộ sưu tập không hợp lệ' });
        } else {
            parentCollectionId = id;
        }
    }

    if (!requiredString(input.name_collection, 1, 255)) {
        errors.push({ field: 'name_collection', message: 'Tên bộ sưu tập bắt buộc từ 1 đến 255 ký tự' });
    }

    let slug = undefined;
    if (input.slug_collection !== undefined && input.slug_collection !== null && input.slug_collection !== '') {
        if (!isString(input.slug_collection) || input.slug_collection.trim().length > 255) {
            errors.push({ field: 'slug_collection', message: 'Slug bộ sưu tập phải là chuỗi không quá 255 ký tự' });
        } else {
            slug = slugify(input.slug_collection);
        }
    } else if (input.name_collection && isString(input.name_collection)) {
        slug = slugify(input.name_collection);
    }

    let description = null;
    if (input.description_collection !== undefined && input.description_collection !== null) {
        if (!isString(input.description_collection)) {
            errors.push({ field: 'description_collection', message: 'Mô tả bộ sưu tập phải là chuỗi' });
        } else {
            description = input.description_collection.trim();
        }
    }

    let image = null;
    if (input.image_collection !== undefined && input.image_collection !== null) {
        if (!isString(input.image_collection) || input.image_collection.trim().length > 1000) {
            errors.push({ field: 'image_collection', message: 'Ảnh bộ sưu tập không hợp lệ hoặc vượt quá 1000 ký tự' });
        } else {
            image = input.image_collection.trim();
        }
    }

    let position = 0;
    if (input.position_collection !== undefined && input.position_collection !== null) {
        const numPos = Number(input.position_collection);
        if (!Number.isSafeInteger(numPos) || numPos < 0) {
            errors.push({ field: 'position_collection', message: 'position_collection phải là số nguyên >= 0' });
        } else {
            position = numPos;
        }
    }

    let isActive = true;
    if (input.is_active !== undefined) {
        if (!isBoolean(input.is_active)) {
            errors.push({ field: 'is_active', message: 'is_active phải là boolean' });
        } else {
            isActive = input.is_active;
        }
    }

    let startAt = null;
    if (input.start_at !== undefined && input.start_at !== null) {
        const d = new Date(input.start_at);
        if (isNaN(d.getTime())) {
            errors.push({ field: 'start_at', message: 'start_at không đúng định dạng ngày tháng hợp lệ' });
        } else {
            startAt = d.toISOString();
        }
    }

    let endAt = null;
    if (input.end_at !== undefined && input.end_at !== null) {
        const d = new Date(input.end_at);
        if (isNaN(d.getTime())) {
            errors.push({ field: 'end_at', message: 'end_at không đúng định dạng ngày tháng hợp lệ' });
        } else {
            endAt = d.toISOString();
        }
    }

    if (startAt && endAt && new Date(startAt) > new Date(endAt)) {
        errors.push({ field: 'start_at', message: 'start_at phải nhỏ hơn hoặc bằng end_at' });
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            name_collection: input.name_collection.trim(),
            parent_collection_id: parentCollectionId,
            slug_collection: slug,
            description_collection: description,
            image_collection: image,
            position_collection: position,
            is_active: isActive,
            start_at: startAt,
            end_at: endAt,
        },
    };
};

export const validateUpdateCollection = (input = {}) => {
    const errors = [];
    if (!input || typeof input !== 'object') {
        errors.push({ field: 'body', message: 'Dữ liệu không hợp lệ' });
        return { ok: false, errors };
    }
    const forbiddenFields = ['collection_id', 'created_at', 'updated_at'];
    for (const field of forbiddenFields) {
        if (field in input) {
            errors.push({ field, message: `Không được phép cập nhật trường ${field}` });
        }
    }

    const value = {};
    if (input.parent_collection_id !== undefined) {
        if (input.parent_collection_id === null || input.parent_collection_id === '') {
            value.parent_collection_id = null;
        } else {
            const id = Number(input.parent_collection_id);
            if (!Number.isSafeInteger(id) || id <= 0) errors.push({ field: 'parent_collection_id', message: 'Nhóm bộ sưu tập không hợp lệ' });
            else value.parent_collection_id = id;
        }
    }
    if (input.name_collection !== undefined) {
        if (!requiredString(input.name_collection, 1, 255)) {
            errors.push({ field: 'name_collection', message: 'Tên bộ sưu tập phải từ 1 đến 255 ký tự' });
        } else {
            value.name_collection = input.name_collection.trim();
        }
    }

    if (input.slug_collection !== undefined) {
        if (input.slug_collection === null || !isString(input.slug_collection) || input.slug_collection.trim().length === 0 || input.slug_collection.trim().length > 255) {
            errors.push({ field: 'slug_collection', message: 'Slug bộ sưu tập phải là chuỗi từ 1 đến 255 ký tự' });
        } else {
            value.slug_collection = slugify(input.slug_collection);
        }
    }

    if (input.description_collection !== undefined) {
        if (input.description_collection === null) {
            value.description_collection = null;
        } else if (!isString(input.description_collection)) {
            errors.push({ field: 'description_collection', message: 'Mô tả bộ sưu tập phải là chuỗi' });
        } else {
            value.description_collection = input.description_collection.trim();
        }
    }

    if (input.image_collection !== undefined) {
        if (input.image_collection === null) {
            value.image_collection = null;
        } else if (!isString(input.image_collection) || input.image_collection.trim().length > 1000) {
            errors.push({ field: 'image_collection', message: 'Ảnh bộ sưu tập không hợp lệ hoặc vượt quá 1000 ký tự' });
        } else {
            value.image_collection = input.image_collection.trim();
        }
    }

    if (input.position_collection !== undefined) {
        const numPos = Number(input.position_collection);
        if (!Number.isSafeInteger(numPos) || numPos < 0) {
            errors.push({ field: 'position_collection', message: 'position_collection phải là số nguyên >= 0' });
        } else {
            value.position_collection = numPos;
        }
    }

    if (input.is_active !== undefined) {
        if (!isBoolean(input.is_active)) {
            errors.push({ field: 'is_active', message: 'is_active phải là boolean' });
        } else {
            value.is_active = input.is_active;
        }
    }

    if (input.start_at !== undefined) {
        if (input.start_at === null) {
            value.start_at = null;
        } else {
            const d = new Date(input.start_at);
            if (isNaN(d.getTime())) {
                errors.push({ field: 'start_at', message: 'start_at không đúng định dạng ngày tháng hợp lệ' });
            } else {
                value.start_at = d.toISOString();
            }
        }
    }

    if (input.end_at !== undefined) {
        if (input.end_at === null) {
            value.end_at = null;
        } else {
            const d = new Date(input.end_at);
            if (isNaN(d.getTime())) {
                errors.push({ field: 'end_at', message: 'end_at không đúng định dạng ngày tháng hợp lệ' });
            } else {
                value.end_at = d.toISOString();
            }
        }
    }

    if (value.start_at && value.end_at && new Date(value.start_at) > new Date(value.end_at)) {
        errors.push({ field: 'start_at', message: 'start_at phải nhỏ hơn hoặc bằng end_at' });
    }

    if (Object.keys(value).length === 0 && errors.length === 0) {
        errors.push({ field: 'body', message: 'Cần cung cấp ít nhất một trường để cập nhật' });
    }

    if (errors.length) return { ok: false, errors };

    return { ok: true, value };
};

export const validateUpdateCollectionStatus = (input = {}) => {
    const errors = [];
    if (input.is_active === undefined || !isBoolean(input.is_active)) {
        errors.push({ field: 'is_active', message: 'is_active là bắt buộc và phải là boolean' });
    }

    if (errors.length) return { ok: false, errors };
    return { ok: true, value: { is_active: input.is_active } };
};

export const validateAddProductToCollection = (input = {}) => {
    const errors = [];
    if (!input || typeof input !== 'object') {
        errors.push({ field: 'body', message: 'Dữ liệu không hợp lệ' });
        return { ok: false, errors };
    }

    // Support batch addition: { products: [{ product_id, position_product_collection }] }
    if (Array.isArray(input.products)) {
        if (input.products.length === 0) {
            errors.push({ field: 'products', message: 'products không được rỗng' });
            return { ok: false, errors };
        }
        const validated = [];
        const seen = new Set();

        for (const item of input.products) {
            if (!item || typeof item !== 'object') {
                errors.push({ field: 'products', message: 'Mỗi phần tử phải là object' });
                break;
            }
            const prodId = Number(item.product_id);
            if (!Number.isSafeInteger(prodId) || prodId <= 0) {
                errors.push({ field: 'product_id', message: 'product_id phải là số nguyên dương' });
                break;
            }
            if (seen.has(prodId)) {
                errors.push({ field: 'product_id', message: 'product_id bị trùng lặp trong danh sách thêm' });
                break;
            }
            seen.add(prodId);

            let pos = 0;
            if (item.position_product_collection !== undefined && item.position_product_collection !== null) {
                const numPos = Number(item.position_product_collection);
                if (!Number.isSafeInteger(numPos) || numPos < 0) {
                    errors.push({ field: 'position_product_collection', message: 'position_product_collection phải là số nguyên >= 0' });
                    break;
                }
                pos = numPos;
            }

            validated.push({
                product_id: prodId,
                position_product_collection: pos,
            });
        }

        if (errors.length) return { ok: false, errors };
        return { ok: true, value: { products: validated } };
    }

    // Support single addition: { product_id, position_product_collection }
    const prodId = Number(input.product_id);
    if (!Number.isSafeInteger(prodId) || prodId <= 0) {
        errors.push({ field: 'product_id', message: 'product_id bắt buộc và phải là số nguyên dương' });
    }

    let pos = 0;
    if (input.position_product_collection !== undefined && input.position_product_collection !== null) {
        const numPos = Number(input.position_product_collection);
        if (!Number.isSafeInteger(numPos) || numPos < 0) {
            errors.push({ field: 'position_product_collection', message: 'position_product_collection phải là số nguyên >= 0' });
        } else {
            pos = numPos;
        }
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            product_id: prodId,
            position_product_collection: pos,
        },
    };
};

export const validateReorderCollectionProducts = (input = {}) => {
    const errors = [];
    if (!input || !Array.isArray(input.products) || input.products.length === 0) {
        errors.push({ field: 'products', message: 'products phải là mảng không rỗng' });
        return { ok: false, errors };
    }

    const seenIds = new Set();
    const validatedProducts = [];

    for (const item of input.products) {
        if (!item || typeof item !== 'object') {
            errors.push({ field: 'products', message: 'Mỗi phần tử trong products phải là object' });
            break;
        }

        const prodId = Number(item.product_id);
        if (!Number.isSafeInteger(prodId) || prodId <= 0) {
            errors.push({ field: 'product_id', message: 'product_id phải là số nguyên dương' });
            break;
        }

        if (seenIds.has(prodId)) {
            errors.push({ field: 'product_id', message: 'product_id không được trùng lặp trong danh sách reorder' });
            break;
        }
        seenIds.add(prodId);

        const pos = Number(item.position_product_collection);
        if (!Number.isSafeInteger(pos) || pos < 0) {
            errors.push({ field: 'position_product_collection', message: 'position_product_collection phải là số nguyên >= 0' });
            break;
        }

        validatedProducts.push({
            product_id: prodId,
            position_product_collection: pos,
        });
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            products: validatedProducts,
        },
    };
};

const INVENTORY_SORT_VALUES = ['stock_asc', 'stock_desc', 'available_asc', 'available_desc', 'sku_asc', 'sku_desc', 'updated_desc'];

export const validateInventoryQuery = (input = {}) => {
    const errors = [];
    if (!input || typeof input !== 'object') {
        errors.push({ field: 'query', message: 'Query không hợp lệ' });
        return { ok: false, errors };
    }

    let page = 1;
    if (input.page !== undefined) {
        const num = Number(input.page);
        if (!Number.isSafeInteger(num) || num < 1) {
            errors.push({ field: 'page', message: 'page phải là số nguyên >= 1' });
        } else {
            page = num;
        }
    }

    let limit = 20;
    if (input.limit !== undefined) {
        const num = Number(input.limit);
        if (!Number.isSafeInteger(num) || num < 1 || num > 100) {
            errors.push({ field: 'limit', message: 'limit phải là số nguyên từ 1 đến 100' });
        } else {
            limit = num;
        }
    }

    let search = undefined;
    if (input.search !== undefined && input.search !== null && input.search !== '') {
        if (!isString(input.search) || input.search.trim().length > 255) {
            errors.push({ field: 'search', message: 'search phải là chuỗi không quá 255 ký tự' });
        } else {
            search = input.search.trim();
        }
    }

    let low_stock = false;
    if (input.low_stock !== undefined) {
        if (input.low_stock === 'true' || input.low_stock === true) {
            low_stock = true;
        } else if (input.low_stock === 'false' || input.low_stock === false) {
            low_stock = false;
        } else {
            errors.push({ field: 'low_stock', message: 'low_stock phải là true hoặc false' });
        }
    }

    let out_of_stock = false;
    if (input.out_of_stock !== undefined) {
        if (input.out_of_stock === 'true' || input.out_of_stock === true) {
            out_of_stock = true;
        } else if (input.out_of_stock === 'false' || input.out_of_stock === false) {
            out_of_stock = false;
        } else {
            errors.push({ field: 'out_of_stock', message: 'out_of_stock phải là true hoặc false' });
        }
    }

    let sort = 'updated_desc';
    if (input.sort !== undefined) {
        if (!INVENTORY_SORT_VALUES.includes(input.sort)) {
            errors.push({ field: 'sort', message: `sort phải là một trong: ${INVENTORY_SORT_VALUES.join(', ')}` });
        } else {
            sort = input.sort;
        }
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: { page, limit, search, low_stock, out_of_stock, sort },
    };
};

export const validateUpdateInventory = (input = {}) => {
    const errors = [];
    if (!input || typeof input !== 'object') {
        errors.push({ field: 'body', message: 'Dữ liệu không hợp lệ' });
        return { ok: false, errors };
    }

    const forbiddenFields = ['inventory_id', 'product_variant_id', 'quantity_reserved', 'created_at', 'updated_at'];
    for (const field of forbiddenFields) {
        if (field in input) {
            errors.push({ field, message: `Không được phép cập nhật trường ${field}` });
        }
    }

    if (input.quantity_stock === undefined) {
        errors.push({ field: 'quantity_stock', message: 'quantity_stock là bắt buộc' });
    } else {
        const num = Number(input.quantity_stock);
        if (!Number.isSafeInteger(num) || num < 0) {
            errors.push({ field: 'quantity_stock', message: 'quantity_stock phải là số nguyên >= 0' });
        }
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            quantity_stock: Number(input.quantity_stock),
        },
    };
};

export const validateVoucherApplication = (input = {}) => {
    const errors = [];
    if (!input || typeof input !== 'object') {
        errors.push({ field: 'body', message: 'Dữ liệu không hợp lệ' });
        return { ok: false, errors };
    }

    if (!input.code_voucher || typeof input.code_voucher !== 'string' || input.code_voucher.trim().length === 0) {
        errors.push({ field: 'code_voucher', message: 'Mã giảm giá là bắt buộc' });
    } else if (input.code_voucher.trim().length > 100) {
        errors.push({ field: 'code_voucher', message: 'Mã giảm giá không được vượt quá 100 ký tự' });
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            code_voucher: input.code_voucher.trim().toUpperCase(),
        },
    };
};

const VOUCHER_DISCOUNT_TYPES = ['percentage', 'fixed_amount'];
const VOUCHER_STATUS_VALUES = ['active', 'inactive', 'scheduled', 'expired', 'exhausted'];
const VOUCHER_SORT_VALUES = ['code_asc', 'code_desc', 'created_asc', 'created_desc', 'end_at_asc', 'end_at_desc'];

export const validateCreateVoucher = (input = {}) => {
    const errors = [];
    if (!input || typeof input !== 'object') {
        errors.push({ field: 'body', message: 'Dữ liệu không hợp lệ' });
        return { ok: false, errors };
    }

    const forbiddenFields = ['voucher_id', 'usage_count', 'created_at', 'updated_at'];
    for (const field of forbiddenFields) {
        if (field in input) {
            errors.push({ field, message: `Không được phép truyền trường ${field}` });
        }
    }

    if (!input.code_voucher || typeof input.code_voucher !== 'string' || input.code_voucher.trim().length === 0) {
        errors.push({ field: 'code_voucher', message: 'Mã giảm giá bắt buộc từ 1 đến 100 ký tự' });
    } else if (input.code_voucher.trim().length > 100) {
        errors.push({ field: 'code_voucher', message: 'Mã giảm giá không được vượt quá 100 ký tự' });
    }

    if (!input.name_voucher || typeof input.name_voucher !== 'string' || input.name_voucher.trim().length === 0) {
        errors.push({ field: 'name_voucher', message: 'Tên giảm giá bắt buộc từ 1 đến 255 ký tự' });
    } else if (input.name_voucher.trim().length > 255) {
        errors.push({ field: 'name_voucher', message: 'Tên giảm giá không được vượt quá 255 ký tự' });
    }

    if (!input.discount_type || !VOUCHER_DISCOUNT_TYPES.includes(input.discount_type)) {
        errors.push({ field: 'discount_type', message: `discount_type phải là một trong: ${VOUCHER_DISCOUNT_TYPES.join(', ')}` });
    }

    const discountVal = Number(input.discount_value);
    if (input.discount_value === undefined || isNaN(discountVal) || discountVal <= 0) {
        errors.push({ field: 'discount_value', message: 'discount_value phải là số dương lớn hơn 0' });
    } else if (input.discount_type === 'percentage' && discountVal > 100) {
        errors.push({ field: 'discount_value', message: 'discount_value cho loại phần trăm không được vượt quá 100' });
    }

    let minOrder = 0;
    if (input.minimum_order_amount !== undefined && input.minimum_order_amount !== null) {
        const numMin = Number(input.minimum_order_amount);
        if (!Number.isSafeInteger(numMin) || numMin < 0) {
            errors.push({ field: 'minimum_order_amount', message: 'minimum_order_amount phải là số nguyên >= 0' });
        } else {
            minOrder = numMin;
        }
    }

    let maxDiscount = null;
    if (input.discount_type === 'percentage') {
        if (input.maximum_discount_amount !== undefined && input.maximum_discount_amount !== null && input.maximum_discount_amount !== '') {
            const numMax = Number(input.maximum_discount_amount);
            if (!Number.isSafeInteger(numMax) || numMax <= 0) {
                errors.push({ field: 'maximum_discount_amount', message: 'maximum_discount_amount phải là số nguyên > 0' });
            } else {
                maxDiscount = numMax;
            }
        }
    }

    let usageLimit = null;
    if (input.usage_limit !== undefined && input.usage_limit !== null && input.usage_limit !== '') {
        const numLimit = Number(input.usage_limit);
        if (!Number.isSafeInteger(numLimit) || numLimit <= 0) {
            errors.push({ field: 'usage_limit', message: 'usage_limit phải là số nguyên > 0' });
        } else {
            usageLimit = numLimit;
        }
    }

    let startAt = null;
    if (input.start_at !== undefined && input.start_at !== null && input.start_at !== '') {
        const d = new Date(input.start_at);
        if (isNaN(d.getTime())) {
            errors.push({ field: 'start_at', message: 'start_at không đúng định dạng ngày tháng hợp lệ' });
        } else {
            startAt = d.toISOString();
        }
    }

    let endAt = null;
    if (input.end_at !== undefined && input.end_at !== null && input.end_at !== '') {
        const d = new Date(input.end_at);
        if (isNaN(d.getTime())) {
            errors.push({ field: 'end_at', message: 'end_at không đúng định dạng ngày tháng hợp lệ' });
        } else {
            endAt = d.toISOString();
        }
    }

    if (startAt && endAt && new Date(startAt) > new Date(endAt)) {
        errors.push({ field: 'start_at', message: 'start_at phải nhỏ hơn hoặc bằng end_at' });
    }

    let isActive = true;
    if (input.is_active !== undefined) {
        if (!isBoolean(input.is_active)) {
            errors.push({ field: 'is_active', message: 'is_active phải là boolean' });
        } else {
            isActive = input.is_active;
        }
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            code_voucher: input.code_voucher.trim().toUpperCase(),
            name_voucher: input.name_voucher.trim(),
            discount_type: input.discount_type,
            discount_value: discountVal,
            minimum_order_amount: minOrder,
            maximum_discount_amount: maxDiscount,
            usage_limit: usageLimit,
            start_at: startAt,
            end_at: endAt,
            is_active: isActive,
        },
    };
};

export const validateUpdateVoucher = (input = {}) => {
    const errors = [];
    if (!input || typeof input !== 'object') {
        errors.push({ field: 'body', message: 'Dữ liệu không hợp lệ' });
        return { ok: false, errors };
    }

    const forbiddenFields = ['voucher_id', 'usage_count', 'created_at', 'updated_at'];
    for (const field of forbiddenFields) {
        if (field in input) {
            errors.push({ field, message: `Không được phép cập nhật trường ${field}` });
        }
    }

    const value = {};

    if (input.code_voucher !== undefined) {
        if (!isString(input.code_voucher) || input.code_voucher.trim().length === 0 || input.code_voucher.trim().length > 100) {
            errors.push({ field: 'code_voucher', message: 'Mã giảm giá phải từ 1 đến 100 ký tự' });
        } else {
            value.code_voucher = input.code_voucher.trim().toUpperCase();
        }
    }

    if (input.name_voucher !== undefined) {
        if (!isString(input.name_voucher) || input.name_voucher.trim().length === 0 || input.name_voucher.trim().length > 255) {
            errors.push({ field: 'name_voucher', message: 'Tên giảm giá phải từ 1 đến 255 ký tự' });
        } else {
            value.name_voucher = input.name_voucher.trim();
        }
    }

    if (input.discount_type !== undefined) {
        if (!VOUCHER_DISCOUNT_TYPES.includes(input.discount_type)) {
            errors.push({ field: 'discount_type', message: `discount_type phải là một trong: ${VOUCHER_DISCOUNT_TYPES.join(', ')}` });
        } else {
            value.discount_type = input.discount_type;
        }
    }

    if (input.discount_value !== undefined) {
        const discountVal = Number(input.discount_value);
        if (isNaN(discountVal) || discountVal <= 0) {
            errors.push({ field: 'discount_value', message: 'discount_value phải là số dương lớn hơn 0' });
        } else {
            value.discount_value = discountVal;
        }
    }

    if (input.minimum_order_amount !== undefined) {
        if (input.minimum_order_amount === null) {
            value.minimum_order_amount = 0;
        } else {
            const numMin = Number(input.minimum_order_amount);
            if (!Number.isSafeInteger(numMin) || numMin < 0) {
                errors.push({ field: 'minimum_order_amount', message: 'minimum_order_amount phải là số nguyên >= 0' });
            } else {
                value.minimum_order_amount = numMin;
            }
        }
    }

    if (input.maximum_discount_amount !== undefined) {
        if (input.maximum_discount_amount === null || input.maximum_discount_amount === '') {
            value.maximum_discount_amount = null;
        } else {
            const numMax = Number(input.maximum_discount_amount);
            if (!Number.isSafeInteger(numMax) || numMax <= 0) {
                errors.push({ field: 'maximum_discount_amount', message: 'maximum_discount_amount phải là số nguyên > 0' });
            } else {
                value.maximum_discount_amount = numMax;
            }
        }
    }

    if (input.usage_limit !== undefined) {
        if (input.usage_limit === null || input.usage_limit === '') {
            value.usage_limit = null;
        } else {
            const numLimit = Number(input.usage_limit);
            if (!Number.isSafeInteger(numLimit) || numLimit <= 0) {
                errors.push({ field: 'usage_limit', message: 'usage_limit phải là số nguyên > 0' });
            } else {
                value.usage_limit = numLimit;
            }
        }
    }

    if (input.start_at !== undefined) {
        if (input.start_at === null || input.start_at === '') {
            value.start_at = null;
        } else {
            const d = new Date(input.start_at);
            if (isNaN(d.getTime())) {
                errors.push({ field: 'start_at', message: 'start_at không đúng định dạng ngày tháng hợp lệ' });
            } else {
                value.start_at = d.toISOString();
            }
        }
    }

    if (input.end_at !== undefined) {
        if (input.end_at === null || input.end_at === '') {
            value.end_at = null;
        } else {
            const d = new Date(input.end_at);
            if (isNaN(d.getTime())) {
                errors.push({ field: 'end_at', message: 'end_at không đúng định dạng ngày tháng hợp lệ' });
            } else {
                value.end_at = d.toISOString();
            }
        }
    }

    if (value.start_at && value.end_at && new Date(value.start_at) > new Date(value.end_at)) {
        errors.push({ field: 'start_at', message: 'start_at phải nhỏ hơn hoặc bằng end_at' });
    }

    if (input.is_active !== undefined) {
        if (!isBoolean(input.is_active)) {
            errors.push({ field: 'is_active', message: 'is_active phải là boolean' });
        } else {
            value.is_active = input.is_active;
        }
    }

    if (Object.keys(value).length === 0 && errors.length === 0) {
        errors.push({ field: 'body', message: 'Cần ít nhất một trường để cập nhật' });
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value,
    };
};

export const validateUpdateVoucherStatus = (input = {}) => {
    const errors = [];
    if (!input || typeof input !== 'object') {
        errors.push({ field: 'body', message: 'Dữ liệu không hợp lệ' });
        return { ok: false, errors };
    }

    if (input.is_active === undefined || !isBoolean(input.is_active)) {
        errors.push({ field: 'is_active', message: 'is_active là bắt buộc và phải là boolean' });
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            is_active: input.is_active,
        },
    };
};

export const validateVoucherQuery = (input = {}) => {
    const errors = [];
    if (!input || typeof input !== 'object') {
        errors.push({ field: 'query', message: 'Query không hợp lệ' });
        return { ok: false, errors };
    }

    let page = 1;
    if (input.page !== undefined) {
        const num = Number(input.page);
        if (!Number.isSafeInteger(num) || num < 1) {
            errors.push({ field: 'page', message: 'page phải là số nguyên >= 1' });
        } else {
            page = num;
        }
    }

    let limit = 20;
    if (input.limit !== undefined) {
        const num = Number(input.limit);
        if (!Number.isSafeInteger(num) || num < 1 || num > 100) {
            errors.push({ field: 'limit', message: 'limit phải là số nguyên từ 1 đến 100' });
        } else {
            limit = num;
        }
    }

    let search = undefined;
    if (input.search !== undefined && input.search !== null && input.search !== '') {
        if (!isString(input.search) || input.search.trim().length > 255) {
            errors.push({ field: 'search', message: 'search phải là chuỗi không quá 255 ký tự' });
        } else {
            search = input.search.trim();
        }
    }

    let discount_type = undefined;
    if (input.discount_type !== undefined && input.discount_type !== null && input.discount_type !== '') {
        if (!VOUCHER_DISCOUNT_TYPES.includes(input.discount_type)) {
            errors.push({ field: 'discount_type', message: `discount_type phải là một trong: ${VOUCHER_DISCOUNT_TYPES.join(', ')}` });
        } else {
            discount_type = input.discount_type;
        }
    }

    let is_active = undefined;
    if (input.is_active !== undefined) {
        if (input.is_active === 'true' || input.is_active === true) {
            is_active = true;
        } else if (input.is_active === 'false' || input.is_active === false) {
            is_active = false;
        } else {
            errors.push({ field: 'is_active', message: 'is_active phải là true hoặc false' });
        }
    }

    let status = undefined;
    if (input.status !== undefined && input.status !== null && input.status !== '') {
        if (!VOUCHER_STATUS_VALUES.includes(input.status)) {
            errors.push({ field: 'status', message: `status phải là một trong: ${VOUCHER_STATUS_VALUES.join(', ')}` });
        } else {
            status = input.status;
        }
    }

    let sort = 'created_desc';
    if (input.sort !== undefined) {
        if (!VOUCHER_SORT_VALUES.includes(input.sort)) {
            errors.push({ field: 'sort', message: `sort phải là một trong: ${VOUCHER_SORT_VALUES.join(', ')}` });
        } else {
            sort = input.sort;
        }
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: { page, limit, search, discount_type, is_active, status, sort },
    };
};

export const validateCheckout = (input = {}, { isAuthenticated = false } = {}) => {
    const errors = [];
    if (!input || typeof input !== 'object') {
        errors.push({ field: 'body', message: 'Dữ liệu không hợp lệ' });
        return { ok: false, errors };
    }

    const allowedPaymentMethods = ['cod', 'payos'];
    if (!input.payment_method || !allowedPaymentMethods.includes(input.payment_method)) {
        errors.push({ field: 'payment_method', message: `payment_method bắt buộc và phải là một trong: ${allowedPaymentMethods.join(', ')}` });
    }

    const value = {
        payment_method: input.payment_method,
    };

    if (input.voucher_code !== undefined && input.voucher_code !== null) {
        if (typeof input.voucher_code === 'string' && input.voucher_code.trim().length > 0) {
            value.voucher_code = input.voucher_code.trim().toUpperCase();
        }
    }

    if (input.note_order !== undefined && input.note_order !== null) {
        if (typeof input.note_order === 'string') {
            value.note_order = input.note_order.trim();
        }
    }

    if (input.guest_token !== undefined && input.guest_token !== null) {
        if (typeof input.guest_token === 'string') {
            value.guest_token = input.guest_token.trim();
        }
    }

    if (isAuthenticated && input.user_address_id !== undefined && input.user_address_id !== null) {
        try {
            value.user_address_id = validatePositiveId(input.user_address_id);
        } catch {
            errors.push({ field: 'user_address_id', message: 'user_address_id phải là số nguyên dương' });
        }
    } else {
        // Must provide inline address
        if (!isAuthenticated) {
            if (!isValidEmail(input.email_order)) {
                errors.push({ field: 'email_order', message: 'Email người nhận không hợp lệ' });
            } else {
                value.email_order = input.email_order.trim().toLowerCase();
            }

            const normalizedPhone = normalizePhone(input.phone_order);
            if (!normalizedPhone) {
                errors.push({ field: 'phone_order', message: 'Số điện thoại người nhận phải gồm 10 chữ số hợp lệ (bắt đầu bằng 0 hoặc +84)' });
            } else {
                value.phone_order = normalizedPhone;
            }
        }

        const hasAddress = input.receiver_name_order_address || input.phone_order_address || input.address_line_order_address;
        if (!hasAddress && isAuthenticated) {
            errors.push({ field: 'address', message: 'Vui lòng chọn user_address_id hoặc cung cấp địa chỉ nhận hàng' });
        } else {
            if (!requiredString(input.receiver_name_order_address, 1, 255)) {
                errors.push({ field: 'receiver_name_order_address', message: 'Tên người nhận là bắt buộc' });
            } else {
                value.receiver_name_order_address = input.receiver_name_order_address.trim();
            }

            const rawPhoneAddress = input.phone_order_address || input.phone_order;
            const normalizedPhoneAddress = normalizePhone(rawPhoneAddress);
            if (!normalizedPhoneAddress) {
                errors.push({ field: 'phone_order_address', message: 'Số điện thoại địa chỉ giao hàng phải gồm 10 chữ số hợp lệ (bắt đầu bằng 0 hoặc +84)' });
            } else {
                value.phone_order_address = normalizedPhoneAddress;
            }

            if (!requiredString(input.address_line_order_address, 1, 500)) {
                errors.push({ field: 'address_line_order_address', message: 'Địa chỉ chi tiết là bắt buộc' });
            } else {
                value.address_line_order_address = input.address_line_order_address.trim();
            }

            value.ward_order_address = typeof input.ward_order_address === 'string' ? input.ward_order_address.trim() : null;
            value.district_order_address = typeof input.district_order_address === 'string' ? input.district_order_address.trim() : null;
            value.province_order_address = typeof input.province_order_address === 'string' ? input.province_order_address.trim() : null;
        }
    }

    if (errors.length) return { ok: false, errors };
    return { ok: true, value };
};

export const validateOrderId = (id) => {
    try {
        const value = validatePositiveId(id);
        return { ok: true, value };
    } catch {
        return { ok: false, errors: [{ field: 'orderId', message: 'ID đơn hàng phải là số nguyên dương' }] };
    }
};

const ORDER_STATUS_VALUES = ['pending', 'confirmed', 'processing', 'shipping', 'completed', 'cancelled'];

export const validateUserOrderQuery = (query = {}) => {
    const errors = [];
    let page = 1;
    let limit = 10;

    if (query.page !== undefined) {
        const parsed = parseInt(query.page, 10);
        if (Number.isNaN(parsed) || parsed < 1) {
            errors.push({ field: 'page', message: 'page phải là số nguyên dương >= 1' });
        } else {
            page = parsed;
        }
    }

    if (query.limit !== undefined) {
        const parsed = parseInt(query.limit, 10);
        if (Number.isNaN(parsed) || parsed < 1 || parsed > 100) {
            errors.push({ field: 'limit', message: 'limit phải là số nguyên từ 1 đến 100' });
        } else {
            limit = parsed;
        }
    }

    let status_order;
    if (query.status_order !== undefined) {
        if (!ORDER_STATUS_VALUES.includes(query.status_order)) {
            errors.push({ field: 'status_order', message: `status_order phải là một trong: ${ORDER_STATUS_VALUES.join(', ')}` });
        } else {
            status_order = query.status_order;
        }
    }

    if (errors.length) return { ok: false, errors };
    return { ok: true, value: { page, limit, status_order } };
};

export const validateGuestOrderLookup = (input = {}) => {
    const errors = [];
    if (!input || typeof input !== 'object') {
        errors.push({ field: 'body', message: 'Dữ liệu không hợp lệ' });
        return { ok: false, errors };
    }

    if (!requiredString(input.order_code, 1, 100)) {
        errors.push({ field: 'order_code', message: 'Mã đơn hàng là bắt buộc' });
    }

    if (!isValidEmail(input.email)) {
        errors.push({ field: 'email', message: 'Email không hợp lệ' });
    }

    const normalizedPhone = normalizePhone(input.phone);
    if (!normalizedPhone) {
        errors.push({ field: 'phone', message: 'Số điện thoại phải gồm 10 chữ số hợp lệ (bắt đầu bằng 0 hoặc +84)' });
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            order_code: input.order_code.trim(),
            email: input.email.trim().toLowerCase(),
            phone: normalizedPhone,
        },
    };
};

export const validateGuestOrderCancel = (input = {}) => {
    const errors = [];
    if (!input || typeof input !== 'object') {
        errors.push({ field: 'body', message: 'Dữ liệu không hợp lệ' });
        return { ok: false, errors };
    }

    if (!isValidEmail(input.email)) {
        errors.push({ field: 'email', message: 'Email không hợp lệ' });
    }

    const normalizedPhone = normalizePhone(input.phone);
    if (!normalizedPhone) {
        errors.push({ field: 'phone', message: 'Số điện thoại phải gồm 10 chữ số hợp lệ (bắt đầu bằng 0 hoặc +84)' });
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            email: input.email.trim().toLowerCase(),
            phone: normalizedPhone,
        },
    };
};

const ADMIN_ORDER_SORT_BY = ['created_at', 'updated_at', 'total_order'];
const PAYMENT_METHOD_VALUES = ['cod', 'payos'];
const PAYMENT_STATUS_VALUES = ['pending', 'paid', 'failed', 'refunded', 'cancelled'];

export const validateAdminOrderQuery = (query = {}) => {
    const errors = [];
    let page = 1;
    let limit = 20;

    if (query.page !== undefined) {
        const parsed = parseInt(query.page, 10);
        if (Number.isNaN(parsed) || parsed < 1) {
            errors.push({ field: 'page', message: 'page phải là số nguyên dương >= 1' });
        } else {
            page = parsed;
        }
    }

    if (query.limit !== undefined) {
        const parsed = parseInt(query.limit, 10);
        if (Number.isNaN(parsed) || parsed < 1 || parsed > 100) {
            errors.push({ field: 'limit', message: 'limit phải là số nguyên từ 1 đến 100' });
        } else {
            limit = parsed;
        }
    }

    let search;
    if (query.search !== undefined && query.search !== null) {
        if (typeof query.search === 'string' && query.search.trim().length > 0) {
            search = query.search.trim();
        }
    }

    let status_order;
    if (query.status_order !== undefined) {
        if (!ORDER_STATUS_VALUES.includes(query.status_order)) {
            errors.push({ field: 'status_order', message: `status_order phải là một trong: ${ORDER_STATUS_VALUES.join(', ')}` });
        } else {
            status_order = query.status_order;
        }
    }

    let status_payment;
    if (query.status_payment !== undefined) {
        if (!PAYMENT_STATUS_VALUES.includes(query.status_payment)) {
            errors.push({ field: 'status_payment', message: `status_payment phải là một trong: ${PAYMENT_STATUS_VALUES.join(', ')}` });
        } else {
            status_payment = query.status_payment;
        }
    }

    let payment_method;
    if (query.payment_method !== undefined) {
        if (!PAYMENT_METHOD_VALUES.includes(query.payment_method)) {
            errors.push({ field: 'payment_method', message: `payment_method phải là một trong: ${PAYMENT_METHOD_VALUES.join(', ')}` });
        } else {
            payment_method = query.payment_method;
        }
    }

    let from_date;
    if (query.from_date !== undefined) {
        const parsed = new Date(query.from_date);
        if (Number.isNaN(parsed.getTime())) {
            errors.push({ field: 'from_date', message: 'from_date không đúng định dạng ISO date' });
        } else {
            from_date = parsed;
        }
    }

    let to_date;
    if (query.to_date !== undefined) {
        const parsed = new Date(query.to_date);
        if (Number.isNaN(parsed.getTime())) {
            errors.push({ field: 'to_date', message: 'to_date không đúng định dạng ISO date' });
        } else {
            to_date = parsed;
        }
    }

    if (from_date && to_date && from_date > to_date) {
        errors.push({ field: 'from_date', message: 'from_date không được lớn hơn to_date' });
    }

    let sort_by = 'created_at';
    if (query.sort_by !== undefined) {
        if (!ADMIN_ORDER_SORT_BY.includes(query.sort_by)) {
            errors.push({ field: 'sort_by', message: `sort_by phải là một trong: ${ADMIN_ORDER_SORT_BY.join(', ')}` });
        } else {
            sort_by = query.sort_by;
        }
    }

    let sort_order = 'desc';
    if (query.sort_order !== undefined) {
        const lower = String(query.sort_order).toLowerCase();
        if (!['asc', 'desc'].includes(lower)) {
            errors.push({ field: 'sort_order', message: 'sort_order phải là asc hoặc desc' });
        } else {
            sort_order = lower;
        }
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            page,
            limit,
            search,
            status_order,
            status_payment,
            payment_method,
            from_date,
            to_date,
            sort_by,
            sort_order,
        },
    };
};

export const validateCancelOrder = (input = {}) => {
    const errors = [];
    if (!input || typeof input !== 'object') {
        errors.push({ field: 'body', message: 'Dữ liệu không hợp lệ' });
        return { ok: false, errors };
    }

    let reason;
    if (input.reason !== undefined && input.reason !== null) {
        if (typeof input.reason !== 'string' || input.reason.trim().length > 1000) {
            errors.push({ field: 'reason', message: 'Lý do hủy đơn không được vượt quá 1000 ký tự' });
        } else {
            reason = input.reason.trim();
        }
    }

    if (errors.length) return { ok: false, errors };
    return { ok: true, value: { reason } };
};

export const validateCreatePayOSPayment = (input = {}) => {
    const errors = [];
    if (!input || typeof input !== 'object') {
        errors.push({ field: 'body', message: 'Dữ liệu không hợp lệ' });
        return { ok: false, errors };
    }

    const rawId = input.order_id !== undefined ? input.order_id : input.orderId;
    const parsedId = parseInt(rawId, 10);
    if (Number.isNaN(parsedId) || parsedId <= 0) {
        errors.push({ field: 'order_id', message: 'order_id phải là số nguyên dương' });
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            order_id: parsedId,
            guest_token: input.guest_token ? String(input.guest_token).trim() : undefined,
            email: input.email ? String(input.email).trim().toLowerCase() : undefined,
            phone: input.phone ? String(input.phone).trim() : undefined,
        },
    };
};

export const validatePayOSWebhook = (input = {}) => {
    const errors = [];
    if (!input || typeof input !== 'object') {
        errors.push({ field: 'body', message: 'Dữ liệu không hợp lệ' });
        return { ok: false, errors };
    }

    if (!input.data || typeof input.data !== 'object') {
        errors.push({ field: 'data', message: 'data không hợp lệ' });
    }

    if (!input.signature || typeof input.signature !== 'string') {
        errors.push({ field: 'signature', message: 'signature không hợp lệ' });
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            code: input.code,
            desc: input.desc,
            success: input.success,
            data: input.data,
            signature: input.signature,
        },
    };
};

export const validateAdminUserQuery = (input = {}) => {
    const errors = [];
    if (input === null || typeof input !== 'object') {
        errors.push({ field: 'query', message: 'Query params không hợp lệ' });
        return { ok: false, errors };
    }

    let page = 1;
    let limit = 20;

    if (input.page !== undefined) {
        const parsed = parseInt(input.page, 10);
        if (Number.isNaN(parsed) || parsed < 1) {
            errors.push({ field: 'page', message: 'page phải là số nguyên dương >= 1' });
        } else {
            page = parsed;
        }
    }

    if (input.limit !== undefined) {
        const parsed = parseInt(input.limit, 10);
        if (Number.isNaN(parsed) || parsed < 1 || parsed > 100) {
            errors.push({ field: 'limit', message: 'limit phải là số nguyên từ 1 đến 100' });
        } else {
            limit = parsed;
        }
    }

    let search;
    if (input.search !== undefined && input.search !== null) {
        if (typeof input.search !== 'string' || input.search.trim().length > 255) {
            errors.push({ field: 'search', message: 'search không được vượt quá 255 ký tự' });
        } else if (input.search.trim().length > 0) {
            search = input.search.trim();
        }
    }

    let role;
    if (input.role !== undefined && input.role !== null && input.role !== '') {
        const rawRole = String(input.role).toLowerCase().trim();
        if (!['customer', 'admin'].includes(rawRole)) {
            errors.push({ field: 'role', message: 'role phải là "customer" hoặc "admin"' });
        } else {
            role = rawRole;
        }
    }

    let status;
    if (input.status !== undefined && input.status !== null && input.status !== '') {
        const rawStatus = String(input.status).toLowerCase().trim();
        if (!['active', 'inactive', 'blocked'].includes(rawStatus)) {
            errors.push({ field: 'status', message: 'status phải là "active", "inactive" hoặc "blocked"' });
        } else {
            status = rawStatus;
        }
    }

    let sort_by = 'created_at';
    if (input.sort_by !== undefined && input.sort_by !== null && input.sort_by !== '') {
        const rawSortBy = String(input.sort_by).toLowerCase().trim();
        const allowedSort = ['created_at', 'updated_at', 'email', 'full_name'];
        if (!allowedSort.includes(rawSortBy)) {
            errors.push({ field: 'sort_by', message: `sort_by phải là một trong: ${allowedSort.join(', ')}` });
        } else {
            sort_by = rawSortBy;
        }
    }

    let sort_order = 'DESC';
    if (input.sort_order !== undefined && input.sort_order !== null && input.sort_order !== '') {
        const rawOrder = String(input.sort_order).toUpperCase().trim();
        if (!['ASC', 'DESC'].includes(rawOrder)) {
            errors.push({ field: 'sort_order', message: 'sort_order phải là "ASC" hoặc "DESC"' });
        } else {
            sort_order = rawOrder;
        }
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            page,
            limit,
            search,
            role,
            status,
            sort_by,
            sort_order,
        },
    };
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const validateUuid = (value) => {
    if (!value || typeof value !== 'string' || !UUID_REGEX.test(value.trim())) {
        return { ok: false, errors: [{ field: 'userId', message: 'User ID phải là UUID hợp lệ' }] };
    }
    return { ok: true, value: value.trim() };
};

export const validateAuditLogId = (value) => {
    return validatePositiveId(value);
};

export const validateAuditLogQuery = (input = {}) => {
    const errors = [];
    if (input === null || typeof input !== 'object') {
        errors.push({ field: 'query', message: 'Query params không hợp lệ' });
        return { ok: false, errors };
    }

    let page = 1;
    let limit = 20;

    if (input.page !== undefined) {
        const parsed = parseInt(input.page, 10);
        if (Number.isNaN(parsed) || parsed < 1) {
            errors.push({ field: 'page', message: 'page phải là số nguyên dương >= 1' });
        } else {
            page = parsed;
        }
    }

    if (input.limit !== undefined) {
        const parsed = parseInt(input.limit, 10);
        if (Number.isNaN(parsed) || parsed < 1 || parsed > 100) {
            errors.push({ field: 'limit', message: 'limit phải là số nguyên từ 1 đến 100' });
        } else {
            limit = parsed;
        }
    }

    let search;
    if (input.search !== undefined && input.search !== null) {
        if (typeof input.search !== 'string' || input.search.trim().length > 255) {
            errors.push({ field: 'search', message: 'search không được vượt quá 255 ký tự' });
        } else if (input.search.trim().length > 0) {
            search = input.search.trim();
        }
    }

    let action;
    if (input.action !== undefined && input.action !== null && input.action !== '') {
        if (typeof input.action !== 'string' || input.action.trim().length > 100) {
            errors.push({ field: 'action', message: 'action không được vượt quá 100 ký tự' });
        } else {
            action = input.action.trim();
        }
    }

    let entity;
    if (input.entity !== undefined && input.entity !== null && input.entity !== '') {
        if (typeof input.entity !== 'string' || input.entity.trim().length > 100) {
            errors.push({ field: 'entity', message: 'entity không được vượt quá 100 ký tự' });
        } else {
            entity = input.entity.trim();
        }
    }

    let entity_id;
    if (input.entity_id !== undefined && input.entity_id !== null && input.entity_id !== '') {
        if (typeof input.entity_id !== 'string' || input.entity_id.trim().length > 100) {
            errors.push({ field: 'entity_id', message: 'entity_id không được vượt quá 100 ký tự' });
        } else {
            entity_id = input.entity_id.trim();
        }
    }

    let admin_user_id;
    if (input.admin_user_id !== undefined && input.admin_user_id !== null && input.admin_user_id !== '') {
        if (typeof input.admin_user_id !== 'string' || !UUID_REGEX.test(input.admin_user_id.trim())) {
            errors.push({ field: 'admin_user_id', message: 'admin_user_id phải là UUID hợp lệ' });
        } else {
            admin_user_id = input.admin_user_id.trim();
        }
    }

    let from_date;
    if (input.from_date !== undefined && input.from_date !== null && input.from_date !== '') {
        const d = new Date(input.from_date);
        if (Number.isNaN(d.getTime())) {
            errors.push({ field: 'from_date', message: 'from_date không hợp lệ' });
        } else {
            from_date = input.from_date;
        }
    }

    let to_date;
    if (input.to_date !== undefined && input.to_date !== null && input.to_date !== '') {
        const d = new Date(input.to_date);
        if (Number.isNaN(d.getTime())) {
            errors.push({ field: 'to_date', message: 'to_date không hợp lệ' });
        } else {
            to_date = input.to_date;
        }
    }

    if (from_date && to_date) {
        if (new Date(from_date) > new Date(to_date)) {
            errors.push({ field: 'date_range', message: 'from_date không được lớn hơn to_date' });
        }
    }

    let sort_order = 'DESC';
    if (input.sort_order !== undefined && input.sort_order !== null && input.sort_order !== '') {
        const rawOrder = String(input.sort_order).toUpperCase().trim();
        if (!['ASC', 'DESC'].includes(rawOrder)) {
            errors.push({ field: 'sort_order', message: 'sort_order phải là "ASC" hoặc "DESC"' });
        } else {
            sort_order = rawOrder;
        }
    }

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        value: {
            page,
            limit,
            search,
            action,
            entity,
            entity_id,
            admin_user_id,
            from_date,
            to_date,
            sort_order,
        },
    };
};

export const validateSessionId = (value) => {
    return validatePositiveId(value);
};

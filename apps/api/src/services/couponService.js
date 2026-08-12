'use strict';

const couponRepo = require('../db/repositories/couponRepository');
const { DomainError, NotFoundError } = require('../domain/errors');

async function validateCoupon(code, userId, amount = 0) {
  if (!code) throw new DomainError('INVALID_COUPON', 'Código de cupón requerido');

  const coupon = await couponRepo.findByCode(code);
  if (!coupon || !coupon.activo) {
    throw new DomainError('INVALID_COUPON', 'El cupón no existe o no está activo');
  }

  if (coupon.fecha_expiracion && new Date(coupon.fecha_expiracion) < new Date()) {
    throw new DomainError('COUPON_EXPIRED', 'El cupón ha expirado');
  }

  if (coupon.uso_maximo > 0 && coupon.usos_realizados >= coupon.uso_maximo) {
    throw new DomainError('COUPON_LIMIT_REACHED', 'El cupón ha alcanzado el límite de usos');
  }

  if (amount < Number(coupon.monto_minimo || 0)) {
    throw new DomainError(
      'COUPON_MINIMUM_NOT_MET',
      `El monto mínimo para aplicar este cupón es $${coupon.monto_minimo}`,
    );
  }

  if (userId) {
    const userUsages = await couponRepo.countUserUsages(coupon.id, userId);
    if (userUsages >= coupon.uso_por_cliente) {
      throw new DomainError('COUPON_USER_LIMIT', 'Ya has utilizado este cupón el número máximo de veces');
    }
  }

  let discount = 0;
  if (coupon.tipo === 'porcentaje') {
    discount = Math.round(amount * (Number(coupon.valor) / 100));
  } else if (coupon.tipo === 'monto_fijo') {
    discount = Math.round(Number(coupon.valor) * 100);
  }

  return {
    valid: true,
    coupon: {
      id: coupon.id,
      codigo: coupon.codigo,
      descripcion: coupon.descripcion,
      tipo: coupon.tipo,
      valor: coupon.valor,
    },
    discountAmount: Math.min(discount, amount),
  };
}

async function createCoupon(data, creatorId) {
  return couponRepo.createCoupon({ ...data, creadoPor: creatorId });
}

async function listCoupons(params) {
  return couponRepo.listCoupons(params);
}

async function toggleCoupon(id, active) {
  const updated = await couponRepo.updateCouponStatus(id, active);
  if (!updated) throw new NotFoundError('Cupón no encontrado');
  return updated;
}

module.exports = {
  validateCoupon,
  createCoupon,
  listCoupons,
  toggleCoupon,
};

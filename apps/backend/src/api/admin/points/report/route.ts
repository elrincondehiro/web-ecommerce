import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { POINTS_MODULE } from "../../../../modules/points";
import type PointsModuleService from "../../../../modules/points/service";
import { REF, roundCents } from "../../../../lib/points";
import { toNumber } from "../../../../lib/numeric";

/**
 * GET /admin/points/report (Fase L-2, G3): saldo vivo total (lo que se podría descontar),
 * abonado, canjeado, devuelto/ajustado y nº de cuentas con saldo. Admin (Medusa protege /admin).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<PointsModuleService>(POINTS_MODULE);
  const trx = await service.listPointsTransactions(
    {},
    { select: ["type", "amount", "reference", "account_id"] },
  );
  const by = new Map<string, number>();
  const sum = (k: string, v: number) => by.set(k, (by.get(k) ?? 0) + v);
  const perAccount = new Map<string, number>();
  for (const t of trx) {
    const a = toNumber(t.amount as never);
    sum(`${t.type}:${t.reference}`, a);
    perAccount.set(
      t.account_id,
      (perAccount.get(t.account_id) ?? 0) + (t.type === "credit" ? a : -a),
    );
  }
  const live = [...perAccount.values()].reduce((acc, v) => acc + v, 0);
  res.json({
    outstanding: roundCents(live),
    accounts_with_balance: [...perAccount.values()].filter((v) => v > 0.004).length,
    earned: roundCents(by.get(`credit:${REF.order}`) ?? 0),
    redeemed: roundCents(by.get(`debit:${REF.redeem}`) ?? 0),
    refunded_on_cancel: roundCents(by.get(`credit:${REF.canceled}`) ?? 0),
    taken_on_return: roundCents(by.get(`debit:${REF.return}`) ?? 0),
    adjusted_credit: roundCents(by.get(`credit:${REF.adjustment}`) ?? 0),
    adjusted_debit: roundCents(by.get(`debit:${REF.adjustment}`) ?? 0),
    lost_on_deletion: roundCents(by.get(`debit:${REF.deleted}`) ?? 0),
  });
}

import { MedusaService } from "@medusajs/framework/utils";
import { balanceOf } from "../../lib/points";
import { PointsAccount } from "./models/points-account";
import { PointsTransaction } from "./models/points-transaction";

export default class PointsModuleService extends MedusaService({
  PointsAccount,
  PointsTransaction,
}) {
  /** Saldo de una cuenta (Σ abonos − Σ cargos). */
  async getBalance(accountId: string): Promise<number> {
    const trx = await this.listPointsTransactions(
      { account_id: accountId },
      { select: ["type", "amount"] },
    );
    return balanceOf(trx);
  }

  /** Cuenta del cliente, o null si aún no tiene. */
  async findAccount(customerId: string) {
    const [account] = await this.listPointsAccounts({ customer_id: customerId });
    return account ?? null;
  }
}

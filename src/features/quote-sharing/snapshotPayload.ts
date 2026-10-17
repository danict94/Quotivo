import { formatMoney, itemTotalCents } from '../../domain';
import { buildFinalDocumentModel } from '../../documents/documentModel';

export function publicQuoteSnapshot(snapshot: unknown) {
  const model = buildFinalDocumentModel(snapshot);
  return {
    version: 1,
    numberLabel: model.numberLabel,
    issueDate: model.issueDate,
    validUntil: model.validUntil,
    title: model.title,
    introduction: model.introduction,
    conditions: model.conditions,
    paymentTerms: model.paymentTerms,
    business: {
      businessName: model.business.businessName,
      address: model.business.address,
      phone: model.business.phone,
      email: model.business.email,
      logoDataBase64: model.business.logoDataBase64 ?? null,
    },
    items: model.items.map((item) => ({
      description: item.description,
      shortDescription: item.shortDescription,
      quantity: item.quantity,
      unit: item.unit,
      totalFormatted: formatMoney(itemTotalCents(item)),
    })),
    totalFormatted: formatMoney(model.baseEconomics.totalCents),
    netFormatted: formatMoney(model.baseEconomics.netCents),
  };
}

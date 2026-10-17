export type QuoteNumbering={year:number;lastNumber:number;nextNumber:number};
export interface QuoteNumberingRepository { get(year:number):Promise<QuoteNumbering|null>; initialize(year:number,lastNumber:number):Promise<QuoteNumbering>; advance(year:number,lastNumber:number):Promise<QuoteNumbering>; }

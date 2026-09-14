import { describe, expect, it } from 'vitest';
import { Transaction } from '@/domain';
import { GetTransactionUseCase } from '@/application/use-cases/transaction/get-transaction.use-case';
import { ListTransactionUseCase } from '@/application/use-cases/transaction/list-transaction.use-case';
import { TransactionRepository } from '@/infrastructure/database/repositories/transaction-repository';

function transaction(): Transaction {
    return Transaction.create({
        title: 'Market',
        amount: 100,
        currencyId: 'try-id',
        accountId: 'account-1',
        categoryId: 'category-1',
        type: 'expense',
        date: new Date(2026, 6, 10),
    });
}

describe('Transaction read use-cases', () => {
    it('GetTransaction entity DTO dönüşümü yapar', async () => {
        const entity = transaction();
        const result = await new GetTransactionUseCase({
            async findById() { return entity; },
        } as any).execute({ id: entity.id });

        expect(result?.id).toBe(entity.id);
        expect(result?.amount.amount).toBe(100);
    });

    it('ListTransaction birleşik filtre ve sayfalamayı repositoryye aktarır', async () => {
        const entity = transaction();
        let receivedFilter: Record<string, unknown> | undefined;
        let receivedOptions: Record<string, unknown> | undefined;
        const result = await new ListTransactionUseCase({
            async findPage(filter: Record<string, unknown>, options: Record<string, unknown>) {
                receivedFilter = filter;
                receivedOptions = options;
                return { data: [entity], total: 41, limit: 20, offset: 40, hasNext: false };
            },
        } as any).execute({
            type: 'expense',
            accountId: 'account-1',
            limit: 20,
            offset: 40,
        });

        expect(receivedFilter).toMatchObject({
            type: 'expense',
            accountId: 'account-1',
        });
        expect(receivedOptions).toEqual({ limit: 20, offset: 40 });
        expect(result.items).toHaveLength(1);
        expect(result).toMatchObject({
            total: 41,
            limit: 20,
            offset: 40,
            hasNext: false,
        });
    });

    it('ListTransaction birleşik okumayı UoW read snapshot içinde yapar', async () => {
        const entity = transaction();
        let inRead = false;
        const result = await new ListTransactionUseCase(
            {
                async findPage() {
                    expect(inRead).toBe(true);
                    return { data: [entity], total: 1, limit: 10, offset: 0, hasNext: false };
                },
            } as any,
            {
                async run<T>(work: () => Promise<T>) { return work(); },
                async read<T>(work: () => Promise<T>) {
                    inRead = true;
                    try { return await work(); } finally { inRead = false; }
                },
            } as any
        ).execute({ limit: 10, offset: 0 });

        expect(result.items).toHaveLength(1);
        expect(result.total).toBe(1);
    });

    it('repository aynı tarihli kayıtları id ile kararlı sıralar', async () => {
        const queries: string[] = [];
        const repository = new TransactionRepository({
            async query(query: string) {
                queries.push(query);
                return { rows: [], rowsAffected: 0 };
            },
        } as any);

        await repository.findPage({}, { limit: 10, offset: 0 });

        // Şema sondası (PRAGMA) dışındaki ilk sorgu sayfa SELECT'i; sıralama ve
        // limit orada olmalı.
        const [pageQuery] = queries.filter(query => !query.startsWith('PRAGMA'));

        // Identifier'lar tırnaklı üretilir: `order`/`group` gibi rezerve kelime
        // adı taşıyan kolonlar tırnaksız hâlde syntax hatası veriyordu.
        expect(pageQuery).toContain('ORDER BY "date" DESC, "id" DESC');
        expect(pageQuery).toContain('LIMIT 10 OFFSET 0');
    });
});

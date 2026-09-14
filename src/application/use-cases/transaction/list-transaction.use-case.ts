import { ITransactionRepository, IUnitOfWork, TransactionFilter } from "@/domain";
import { InvalidValueException } from "@/domain/exceptions/domain.exception";
import { TransactionMapper } from "@/application/mappers";
import {
    ListTransactionsInput,
    ListTransactionsOutput
} from "@/application/dto/transaction.dto";

/** Tek sayfada dönülebilecek azami kayıt sayısı. */
const MAX_PAGE_SIZE = 100;

export class ListTransactionUseCase {
    constructor(
        private readonly transactionRepository: ITransactionRepository,
        private readonly unitOfWork?: IUnitOfWork
    ) {}

    async execute(
        input: ListTransactionsInput = {}
    ): Promise<ListTransactionsOutput> {
        // `items` ve `total` tek snapshot içinde okunmalı: aralarına giren bir
        // yazma, listeyi bir veri durumundan, sayacı başka bir durumdan getirip
        // `hasNext`'i yanlış hesaplatabiliyordu. `read()` yoksa (eski/test
        // adapter'ı) iş doğrudan çalışır.
        const runRead =
            this.unitOfWork?.read?.bind(this.unitOfWork)
            ?? this.unitOfWork?.run?.bind(this.unitOfWork)
            ?? (<T>(work: () => Promise<T>) => work());

        return runRead(() => this.readPage(input));
    }

    private async readPage(
        input: ListTransactionsInput
    ): Promise<ListTransactionsOutput> {
        // Sayfalama sınırı burada, tek yerde doğrulanır. Sessizce kırpmak,
        // çağıranın eksik veri aldığını fark etmemesine yol açıyordu.
        const limit = input.limit ?? 50;
        const offset = input.offset ?? 0;

        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
            throw new InvalidValueException('limit', `1..${MAX_PAGE_SIZE} arası olmalı (verilen: ${limit})`);
        }
        if (!Number.isInteger(offset) || offset < 0) {
            throw new InvalidValueException('offset', `negatif olamaz (verilen: ${offset})`);
        }

        const filter = this.buildFilter(input);
        const page = await this.transactionRepository.findPage(filter, { limit, offset });

        return {
            items: TransactionMapper.toDTOList(page.data),
            total: page.total,
            limit: page.limit,
            offset: page.offset,
            hasNext: page.hasNext
        };
    }

    /**
     * `period` kısayolunu tarih aralığına çevirir.
     *
     * Eskiden `thisMonth` doğrudan `findThisMonth()`e gidiyordu ve diğer
     * filtrelerle (tür, kategori, hesap) birleşemiyordu; artık hepsi tek
     * sorguda birleşiyor.
     */
    private buildFilter(input: ListTransactionsInput): TransactionFilter {
        const filter: TransactionFilter = {
            type: input.type,
            categoryId: input.categoryId,
            accountId: input.accountId,
            startDate: input.startDate,
            endDate: input.endDate,
        }

        if (input.period === 'thisMonth') {
            const now = new Date()

            filter.startDate = new Date(now.getFullYear(), now.getMonth(), 1)
            filter.endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        }

        return filter
    }
}

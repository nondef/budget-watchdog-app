import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { resolveRepository } from "@/infrastructure/database/repositories/resolve";
import { CurrencyRepository } from "@/infrastructure/database/repositories";
import { CurrencyDTO, ListCurrenciesUseCase } from "@/application";
import { CurrencyMapper } from "@/application/mappers";

export const useCurrenciesStore = defineStore('currencies', () => {
    const currencies = ref<CurrencyDTO[]>([])

    const repository = resolveRepository(CurrencyRepository)

    const loadCurrencies = async () => {
        currencies.value = (
            await new ListCurrenciesUseCase(repository).execute()
        ).items
    }

    const searchCurrencies = async (term: string) => {
        if (!term.trim()) {
            return currencies.value
        }

        return CurrencyMapper.toDTOList(await repository.search(term))
    }

    const findByCode = async (code: string) => {
        const currency = await repository.findByCode(code)
        return currency ? CurrencyMapper.toDTO(currency) : null
    }

    const findById = async (id: string) => {
        return currencies.value.find(currency => currency.id === id)
    }

    /**
     * Senkron lookup — yüklü currencies listesinden eşler.
     * Component'lerde computed/template içinde id → currency çevirmek için.
     */
    const currencyById = (id?: string) => {
        if (!id) return undefined
        return currencies.value.find(currency => currency.id === id)
    }

    const currencyCount = computed(() => currencies.value.length)

    return {
        currencies,
        loadCurrencies,
        searchCurrencies,
        findByCode,
        findById,
        currencyById,
        currencyCount
    }
})

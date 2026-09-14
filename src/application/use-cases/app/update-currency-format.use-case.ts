import { IAppSettingsRepository } from '@/domain/interfaces/app-settings-repository.interface';
import { CurrencyFormat } from '@/domain/value-objects/currency-format';
import { StateNotInitializedException } from '@/domain/exceptions/domain.exception';
import { AppDTO } from "@/application";
import { AppMapper } from "@/application/mappers";
import { IUnitOfWork } from '@/domain';

export interface UpdateCurrencyFormatInput {
    format: CurrencyFormat;
}

export class UpdateCurrencyFormatUseCase {
    constructor(
        private appSettingsRepository: IAppSettingsRepository,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: UpdateCurrencyFormatInput): Promise<AppDTO> {
        return this.unitOfWork.run(async () => {
            const settings = await this.appSettingsRepository.get();
            if (!settings) throw new StateNotInitializedException('AppSettings');

            settings.changeCurrencyFormat(input.format);
            await this.appSettingsRepository.save(settings);
            return AppMapper.toDTO(settings)
        })
    }
}

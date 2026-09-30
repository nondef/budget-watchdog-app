import { IAppSettingsRepository } from '@/domain/interfaces/app-settings-repository.interface';
import { StateNotInitializedException } from '@/domain/exceptions/domain.exception';
import { AppDTO } from "@/application";
import { AppMapper } from "@/application/mappers";
import { IUnitOfWork } from '@/domain';

export interface UpdateMarketFavoritesInput {
    codes: readonly string[];
}

export class UpdateMarketFavoritesUseCase {
    constructor(
        private appSettingsRepository: IAppSettingsRepository,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: UpdateMarketFavoritesInput): Promise<AppDTO> {
        return this.unitOfWork.run(async () => {
            const settings = await this.appSettingsRepository.get();
            if (!settings) throw new StateNotInitializedException('AppSettings');

            settings.changeMarketFavorites(input.codes);
            await this.appSettingsRepository.save(settings);
            return AppMapper.toDTO(settings);
        })
    }
}

import { IAppSettingsRepository } from '@/domain/interfaces/app-settings-repository.interface';
import { Theme } from '@/domain/value-objects/theme';
import { StateNotInitializedException } from '@/domain/exceptions/domain.exception';
import { AppMapper } from "@/application/mappers/app.mapper";
import { AppDTO } from "@/application";
import { IUnitOfWork } from '@/domain';

export interface UpdateThemeInput {
    theme: Theme;
}

export class UpdateThemeUseCase {
    constructor(
        private appSettingsRepository: IAppSettingsRepository,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: UpdateThemeInput): Promise<AppDTO> {
        return this.unitOfWork.run(async () => {
            const settings = await this.appSettingsRepository.get();
            if (!settings) throw new StateNotInitializedException('AppSettings');

            settings.changeTheme(input.theme);
            await this.appSettingsRepository.save(settings);
            return AppMapper.toDTO(settings)
        })
    }
}

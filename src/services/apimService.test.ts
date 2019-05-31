import Serverless from 'serverless';
import { MockFactory } from '../test/mockFactory';
import { ApiManagementConfig } from '../models/apiManagement';
import { ApimService } from './apimService';
import { interpolateJson } from '../test/utils';
import axios from 'axios';
import { Api, Backend, Property } from '@azure/arm-apimanagement';
import apimGetService404 from '../test/responses/apim-get-service-404.json';
import apimGetService200 from '../test/responses/apim-get-service-200.json';
import apimGetApi200 from '../test/responses/apim-get-api-200.json';
import apimGetApi404 from '../test/responses/apim-get-api-404.json';
import { FunctionAppService } from './functionAppService';
import { Site } from '@azure/arm-appservice/esm/models';
import {
  PropertyContract, BackendContract, BackendCreateOrUpdateResponse,
  ApiCreateOrUpdateResponse, PropertyCreateOrUpdateResponse, ApiContract,
} from '@azure/arm-apimanagement/esm/models';

describe('APIM Service', () => {
  const apimConfig: ApiManagementConfig = {
    name: 'test-apim-resource',
    api: {
      name: 'test-apim-api1',
      subscriptionRequired: false,
      displayName: 'API 1',
      description: 'description of api 1',
      protocols: ['https'],
      path: 'test-api1',
    },
  };

  let serverless: Serverless;

  beforeEach(() => {
    serverless = MockFactory.createTestServerless();
    serverless.service.provider = {
      ...serverless.service.provider,
      name: 'azure',
    };

    serverless.service['service'] = 'test-sls';
    serverless.service.provider['resourceGroup'] = 'test-sls-rg';
    serverless.service.provider['location'] = 'West US';
    serverless.service.provider['apim'] = apimConfig;

    serverless.variables = {
      ...serverless.variables,
      azureCredentials: MockFactory.createTestAzureCredentials(),
      subscriptionId: 'ABC123',
    };
  });

  it('is defined', () => {
    expect(ApimService).toBeDefined();
  });

  it('can be instantiated', () => {
    const service = new ApimService(serverless);
    expect(service).not.toBeNull();
  });

  describe('Get service reference', () => {
    it('returns null when service doesn\'t exist', async () => {
      axios.request = jest.fn((requestConfig) => MockFactory.createTestAxiosResponse(requestConfig, apimGetService404, 404));

      const service = new ApimService(serverless);
      const resource = await service.get();

      expect(resource).toBeNull();
    });

    it('returns instance of service resource', async () => {
      const expectedResponse = interpolateJson(apimGetService200, {
        resourceGroup: {
          name: serverless.service.provider['resourceGroup'],
          location: serverless.service.provider['location'],
        },
        resource: {
          name: apimConfig.name,
        },
      });

      axios.request = jest.fn((requestConfig) => MockFactory.createTestAxiosResponse(requestConfig, expectedResponse));

      const service = new ApimService(serverless);
      const resource = await service.get();

      expect(resource).not.toBeNull();
      expect(resource).toMatchObject({
        name: apimConfig.name,
        location: serverless.service.provider['location'],
      });
    });
  });

  describe('Get API reference', () => {
    it('returns null when API doesn\'t exist', async () => {
      axios.request = jest.fn((requestConfig) => MockFactory.createTestAxiosResponse(requestConfig, apimGetApi404, 404));

      const service = new ApimService(serverless);
      const api = await service.getApi();
      expect(api).toBeNull();
    });

    it('returns the API reference', async () => {
      const expectedResponse = interpolateJson(apimGetApi200, {
        resourceGroup: {
          name: serverless.service.provider['resourceGroup'],
          location: serverless.service.provider['location'],
        },
        service: {
          name: apimConfig.name,
        },
        resource: {
          name: apimConfig.api.name,
          displayName: apimConfig.api.displayName,
          description: apimConfig.api.description,
          path: apimConfig.api.path,
        },
      });

      axios.request = jest.fn((requestConfig) => MockFactory.createTestAxiosResponse(requestConfig, expectedResponse));

      const service = new ApimService(serverless);
      const api = await service.getApi();

      expect(api).not.toBeNull();
      expect(api).toMatchObject({
        displayName: apimConfig.api.displayName,
        description: apimConfig.api.description,
        path: apimConfig.api.path,
      });
    });
  });

  describe('Deploying API', () => {
    let backendConfig: BackendContract;
    let resourceGroupName: string;
    let appName: string;
    let serviceName: string;
    let apiName: string;
    let backendName: string;
    let functionApp: Site;
    let masterKey: string;
    let expectedApi: ApiContract;
    let expectedApiResult: ApiContract;
    let expectedBackend: BackendContract;
    let expectedProperty: PropertyContract;

    beforeEach(() => {
      backendConfig = apimConfig.backend || {} as BackendContract;
      resourceGroupName = serverless.service.provider['resourceGroup'];
      appName = serverless.service['service'];
      serviceName = apimConfig.name;
      apiName = apimConfig.api.name;
      backendName = backendConfig.name || appName;

      functionApp = {
        id: '/testapp1',
        name: 'Test Site',
        location: 'West US',
        defaultHostName: 'testsite.azurewebsites.net',
      };
      masterKey = 'ABC123';

      FunctionAppService.prototype.get = jest.fn(() => Promise.resolve(functionApp));
      FunctionAppService.prototype.getMasterKey = jest.fn(() => Promise.resolve(masterKey));

      expectedApi = {
        isCurrent: true,
        subscriptionRequired: apimConfig.api.subscriptionRequired,
        displayName: apimConfig.api.displayName,
        description: apimConfig.api.description,
        path: apimConfig.api.path,
        protocols: apimConfig.api.protocols,
      };

      expectedApiResult = {
        id: apimConfig.api.name,
        name: apimConfig.api.name,
        isCurrent: true,
        subscriptionRequired: apimConfig.api.subscriptionRequired,
        displayName: apimConfig.api.displayName,
        description: apimConfig.api.description,
        path: apimConfig.api.path,
        protocols: apimConfig.api.protocols,
      };

      expectedBackend = {
        credentials: {
          header: {
            'x-functions-key': [`{{${serverless.service['service']}-key}}`],
          },
        },
        title: backendConfig.title || functionApp.name,
        tls: backendConfig.tls,
        proxy: backendConfig.proxy,
        description: backendConfig.description,
        protocol: backendConfig.protocol || 'http',
        resourceId: `https://management.azure.com${functionApp.id}`,
        url: `https://${functionApp.defaultHostName}/api`,
      };

      expectedProperty = {
        displayName: `${serverless.service['service']}-key`,
        secret: true,
        value: masterKey,
      };
    });

    it('ensures API, backend and keys have all been set', async () => {

      Api.prototype.createOrUpdate =
        jest.fn(() => MockFactory.createTestArmSdkResponse<ApiContract, ApiCreateOrUpdateResponse>(expectedApiResult, 201));
      Backend.prototype.createOrUpdate =
        jest.fn(() => MockFactory.createTestArmSdkResponse<BackendContract, BackendCreateOrUpdateResponse>(expectedBackend, 201));
      Property.prototype.createOrUpdate =
        jest.fn(() => MockFactory.createTestArmSdkResponse<PropertyContract, PropertyCreateOrUpdateResponse>(expectedProperty, 201));

      const apimService = new ApimService(serverless);
      const result = await apimService.deployApi();

      expect(result).toMatchObject(expectedApiResult);
      expect(Api.prototype.createOrUpdate).toBeCalledWith(
        resourceGroupName,
        serviceName,
        apiName,
        expectedApi,
      );

      expect(Backend.prototype.createOrUpdate).toBeCalledWith(
        resourceGroupName,
        serviceName,
        backendName,
        expectedBackend,
      );

      expect(Property.prototype.createOrUpdate).toBeCalledWith(
        resourceGroupName,
        serviceName,
        expectedProperty.displayName,
        expectedProperty,
      );
    });

    it('fails when API deployment fails', async () => {
      const apiError = 'Error creating API';
      Api.prototype.createOrUpdate = jest.fn(() => Promise.reject(apiError));

      const apimService = new ApimService(serverless);
      await expect(apimService.deployApi()).rejects.toEqual(apiError);
    });

    it('fails when Backend deployment fails', async () => {
      const apiError = 'Error creating Backend';

      Api.prototype.createOrUpdate =
        jest.fn(() => MockFactory.createTestArmSdkResponse<ApiContract, ApiCreateOrUpdateResponse>(expectedApiResult, 201));
      Backend.prototype.createOrUpdate = jest.fn(() => Promise.reject(apiError));

      const apimService = new ApimService(serverless);
      await expect(apimService.deployApi()).rejects.toEqual(apiError);
    });

    it('fails when Property deployment fails', async () => {
      const apiError = 'Error creating Property';

      Api.prototype.createOrUpdate =
        jest.fn(() => MockFactory.createTestArmSdkResponse<ApiContract, ApiCreateOrUpdateResponse>(expectedApiResult, 201));
      Backend.prototype.createOrUpdate =
        jest.fn(() => MockFactory.createTestArmSdkResponse<BackendContract, BackendCreateOrUpdateResponse>(expectedBackend, 201));
      Property.prototype.createOrUpdate = jest.fn(() => Promise.reject(apiError));

      const apimService = new ApimService(serverless);
      await expect(apimService.deployApi()).rejects.toEqual(apiError);
    });
  });

  describe('Deploying Functions', () => {
    xit('ensures all serverless functions have been deployed into specified API', () => {
      fail();
    });
  });
});
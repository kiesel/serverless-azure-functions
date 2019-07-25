import path from "path";
import Serverless from "serverless";
import { MockFactory } from "../test/mockFactory";
import { FunctionMetadata, Utils } from "./utils";

describe("utils", () => {
  let sls: Serverless;

  beforeEach(() => {
    const slsConfig = {
      service: "My test service",
      provider: "azure",
      functions: MockFactory.createTestSlsFunctionConfig(),
    };

    sls = MockFactory.createTestServerless();
    Object.assign(sls.service, slsConfig);
  });

  it("resolves handler when handler code is outside function folders", () => {
    sls.service["functions"].hello.handler = "src/handlers/hello.handler";
    MockFactory.updateService(sls);

    const functions = sls.service.getAllFunctions();
    const metadata = Utils.getFunctionMetaData(functions[0], sls);

    const expectedMetadata: FunctionMetadata = {
      entryPoint: "handler",
      handlerPath: path.normalize("../src/handlers/hello.js"),
      params: expect.anything(),
    };

    expect(metadata).toEqual(expectedMetadata);
  });

  it("resolves handler when code is in function folder", () => {
    sls.service["functions"].hello.handler = "hello/index.handler";
    MockFactory.updateService(sls);

    const functions = sls.service.getAllFunctions();
    const metadata = Utils.getFunctionMetaData(functions[0], sls);

    const expectedMetadata: FunctionMetadata = {
      entryPoint: "handler",
      handlerPath: path.normalize("index.js"),
      params: expect.anything(),
    };

    expect(metadata).toEqual(expectedMetadata);
  });

  it("resolves handler when code is at the project root", () => {
    sls.service["functions"].hello.handler = "hello.handler";
    MockFactory.updateService(sls);

    const functions = sls.service.getAllFunctions();
    const metadata = Utils.getFunctionMetaData(functions[0], sls);

    const expectedMetadata: FunctionMetadata = {
      entryPoint: "handler",
      handlerPath: path.normalize("../hello.js"),
      params: expect.anything(),
    };

    expect(metadata).toEqual(expectedMetadata);
  });

  it("should create string from substrings", () => {
    expect(
      Utils.appendSubstrings(
        2,
        "abcde",
        "fghij",
        "klmno",
        "pqrst",
        "uvwxyz",
        "ab",
      )
    ).toEqual("abfgklpquvab");
  });

  it("Creates a short name for an azure region", () => {
    const expected = "ausse";
    const actual = Utils.createShortAzureRegionName("australiasoutheast");

    expect(actual).toEqual(expected);
  });

  it("Creates a short stage name from a well known name", () => {
    const expected = "prod";
    const actual = Utils.createShortStageName("production");

    expect(actual).toEqual(expected);
  });

  it("Creates a short stage name from a unknown name", () => {
    const value = "user acceptance";
    const actual = Utils.createShortStageName(value);

    expect(actual).toEqual(value.substr(0, 3));
  });

  it("Creates a short stage name from multiple values", () => {
    const actual = Utils.createShortStageName("production dogfood");
    expect(actual).toEqual("proddf");
  });

  it("Creates unique short names for all azure regions", () => {
    const regions = [
      "eastasia",
      "southeastasia",
      "centralus",
      "eastus",
      "eastus2",
      "westus",
      "northcentralus",
      "southcentralus",
      "northeurope",
      "westeurope",
      "japanwest",
      "japaneast",
      "brazilsouth",
      "australiaeast",
      "australiasoutheast",
      "southindia",
      "centralindia",
      "westindia",
      "canadacentral",
      "canadaeast",
      "uksouth",
      "ukwest",
      "westcentralus",
      "westus2",
      "koreacentral",
      "koreasouth",
      "francecentral",
      "francesouth",
      "australiacentral",
      "australiacentral2",
      "uaecentral",
      "uaenorth",
      "southafricanorth",
      "southafricawest"
    ];

    const results = {};
    regions.forEach((region) => {
      const result = Utils.createShortAzureRegionName(region);
      results[result] = region;
    });

    expect(Object.keys(results)).toHaveLength(regions.length);
  });

  it("gets a normalized region name from full region name", () => {
    const result = Utils.getNormalizedRegionName("West US 2");
    expect(result).toEqual("westus2");
  });

  it("Performs noop if region name is already normalized", () => {
    const expected = "westus2";
    const actual = Utils.getNormalizedRegionName(expected);
    expect(actual).toEqual(expected);
  });

  it("should get a timestamp from a name", () => {
    expect(Utils.getTimestampFromName("myDeployment-t12345")).toEqual("12345");
    expect(Utils.getTimestampFromName("myDeployment-t678987645")).toEqual("678987645");
    expect(Utils.getTimestampFromName("-t12345")).toEqual("12345");

    expect(Utils.getTimestampFromName("myDeployment-t")).toEqual(null);
    expect(Utils.getTimestampFromName("")).toEqual(null);
  });

  it("should get incoming binding", () => {
    expect(Utils.getIncomingBindingConfig(MockFactory.createTestAzureFunctionConfig())).toEqual(
      {
        http: true,
        "x-azure-settings": MockFactory.createTestHttpBinding("in"),
      }
    );
  });

  it("should get outgoing binding", () => {
    expect(Utils.getOutgoingBinding(MockFactory.createTestAzureFunctionConfig())).toEqual(
      {
        http: true,
        "x-azure-settings": MockFactory.createTestHttpBinding("out"),
      }
    );
  });

  describe("runWithRetry", () => {
    it("returns values after 1st run", async () => {
      const expected = "success";
      let lastRetry = 0;

      const result = await Utils.runWithRetry((retry) => {
        lastRetry = retry;
        return Promise.resolve(expected);
      });

      expect(lastRetry).toEqual(1);
      expect(result).toEqual(expected);
    });

    it("returns values after successfully retry (reject promise)", async () => {
      const expected = "success";
      let lastRetry = 0;

      const result = await Utils.runWithRetry((retry) => {
        lastRetry = retry;
        if (retry === 1) {
          return Promise.reject("rejected");
        }

        return Promise.resolve(expected);
      });

      expect(lastRetry).toEqual(2);
      expect(result).toEqual(expected);
    });

    it("returns values after successfully retry (throw error)", async () => {
      const expected = "success";
      let lastRetry = 0;

      const result = await Utils.runWithRetry((retry) => {
        lastRetry = retry;
        if (retry === 1) {
          throw new Error("Ooops!")
        }

        return Promise.resolve(expected);
      });

      expect(lastRetry).toEqual(2);
      expect(result).toEqual(expected);
    });
    it("throws error after reties", async () => {
      const maxRetries = 5;
      let lastRetry = 0;

      const test = async () => {
        await Utils.runWithRetry((retry) => {
          lastRetry = retry;
          return Promise.reject("rejected");
        }, maxRetries, 100);
      };

      await expect(test()).rejects.toEqual("rejected");
      expect(lastRetry).toEqual(maxRetries);
    });
  });
});

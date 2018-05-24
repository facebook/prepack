/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { EnvironmentRecord } from "../environment.js";
import { Realm, ExecutionContext } from "../realm.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import type { SourceFile } from "../types.js";
import { AbruptCompletion } from "../completions.js";
import { Generator } from "../utils/generator.js";
import generate from "babel-generator";
import traverseFast from "../utils/traverse-fast.js";
import invariant from "../invariant.js";
import type { SerializerOptions } from "../options.js";
import { SerializerStatistics } from "./statistics.js";
import { type ReactSerializerState, type SerializedResult, ReactStatistics } from "./types.js";
import { Functions } from "./functions.js";
import { Logger } from "../utils/logger.js";
import { Modules } from "../utils/modules.js";
import { stripFlowTypeAnnotations } from "../utils/flow.js";
import { LoggingTracer } from "./LoggingTracer.js";
import { ResidualHeapVisitor } from "./ResidualHeapVisitor.js";
import { ResidualHeapSerializer } from "./ResidualHeapSerializer.js";
import { ResidualHeapValueIdentifiers } from "./ResidualHeapValueIdentifiers.js";
import { LazyObjectsSerializer } from "./LazyObjectsSerializer.js";
import * as t from "babel-types";
import { ResidualHeapRefCounter } from "./ResidualHeapRefCounter";
import { ResidualHeapGraphGenerator } from "./ResidualHeapGraphGenerator";
import { Referentializer } from "./Referentializer.js";

export class Serializer {
  constructor(realm: Realm, serializerOptions: SerializerOptions = {}) {
    invariant(realm.useAbstractInterpretation);
    // Start tracking mutations
    realm.generator = new Generator(realm, "main");

    this.realm = realm;
    this.logger = new Logger(this.realm, !!serializerOptions.internalDebug);
    this.modules = new Modules(
      this.realm,
      this.logger,
      !!serializerOptions.logModules,
      !!serializerOptions.delayUnsupportedRequires,
      !!serializerOptions.accelerateUnsupportedRequires
    );
    this.functions = new Functions(this.realm, this.modules.moduleTracer);
    if (serializerOptions.trace) this.realm.tracers.push(new LoggingTracer(this.realm));

    this.options = serializerOptions;
    this.react = {
      usedReactElementKeys: new Set(),
    };
  }

  realm: Realm;
  functions: Functions;
  logger: Logger;
  modules: Modules;
  options: SerializerOptions;
  react: ReactSerializerState;

  _execute(sources: Array<SourceFile>, sourceMaps?: boolean = false): { [string]: string } {
    let realm = this.realm;
    let [res, code] = realm.$GlobalEnv.executeSources(sources, "script", ast => {
      let realmPreludeGenerator = realm.preludeGenerator;
      invariant(realmPreludeGenerator);
      let forbiddenNames = realmPreludeGenerator.nameGenerator.forbiddenNames;
      traverseFast(ast, node => {
        if (!t.isIdentifier(node)) return false;

        forbiddenNames.add(((node: any): BabelNodeIdentifier).name);
        return true;
      });
    });

    if (res instanceof AbruptCompletion) {
      let context = new ExecutionContext();
      realm.pushContext(context);
      try {
        this.logger.logCompletion(res);
      } finally {
        realm.popContext(context);
      }
      let diagnostic = new CompilerDiagnostic("Global code may end abruptly", res.location, "PP0016", "FatalError");
      realm.handleError(diagnostic);
      throw new FatalError();
    }
    return code;
  }

  init(sources: Array<SourceFile>, sourceMaps?: boolean = false): void | SerializedResult {
    let realmStatistics = this.realm.statistics;
    invariant(realmStatistics instanceof SerializerStatistics, "serialization requires SerializerStatistics");
    let statistics: SerializerStatistics = realmStatistics;

    let result = statistics.total.measure(() => {
      // Phase 1: Let's interpret.
      if (this.realm.react.verbose) {
        this.logger.logInformation(`Evaluating initialization path...`);
      }

      let code = this._execute(sources);
      let environmentRecordIdAfterGlobalCode = EnvironmentRecord.nextId;

      if (this.logger.hasErrors()) return undefined;

      statistics.resolveInitializedModules.measure(() => this.modules.resolveInitializedModules());

      statistics.checkThatFunctionsAreIndependent.measure(() =>
        this.functions.checkThatFunctionsAreIndependent(environmentRecordIdAfterGlobalCode)
      );

      let reactStatistics;
      if (this.realm.react.enabled) {
        statistics.optimizeReactComponentTreeRoots.measure(() => {
          reactStatistics = new ReactStatistics();
          this.functions.optimizeReactComponentTreeRoots(
            reactStatistics,
            this.react,
            environmentRecordIdAfterGlobalCode
          );
        });
      }

      if (this.options.initializeMoreModules) {
        statistics.initializeMoreModules.measure(() => this.modules.initializeMoreModules());
        if (this.logger.hasErrors()) return undefined;
      }

      let heapGraph;
      let ast = (() => {
        // We wrap the following in an anonymous function declaration to ensure
        // that all local variables are locally scoped, and allocated memory cannot
        // get released when this function returns.

        let additionalFunctionValuesAndEffects = this.functions.getAdditionalFunctionValuesToEffects();

        // Deep traversal of the heap to identify the necessary scope of residual functions
        let preludeGenerator = this.realm.preludeGenerator;
        invariant(preludeGenerator !== undefined);
        let referentializer = new Referentializer(
          this.realm,
          this.options,
          preludeGenerator.createNameGenerator("__scope_"),
          preludeGenerator.createNameGenerator("__get_scope_binding_")
        );
        if (this.realm.react.verbose) {
          this.logger.logInformation(`Visiting evaluated nodes...`);
        }
        let residualHeapVisitor = new ResidualHeapVisitor(
          this.realm,
          this.logger,
          this.modules,
          additionalFunctionValuesAndEffects,
          referentializer
        );
        statistics.deepTraversal.measure(() => residualHeapVisitor.visitRoots());
        if (this.logger.hasErrors()) return undefined;

        if (this.realm.react.verbose) {
          this.logger.logInformation(`Serializing evaluated nodes...`);
        }
        const realmPreludeGenerator = this.realm.preludeGenerator;
        invariant(realmPreludeGenerator);
        const residualHeapValueIdentifiers = new ResidualHeapValueIdentifiers(
          residualHeapVisitor.values.keys(),
          realmPreludeGenerator
        );

        if (this.options.heapGraphFormat) {
          const heapRefCounter = new ResidualHeapRefCounter(
            this.realm,
            this.logger,
            this.modules,
            additionalFunctionValuesAndEffects,
            referentializer
          );
          heapRefCounter.visitRoots();

          const heapGraphGenerator = new ResidualHeapGraphGenerator(
            this.realm,
            this.logger,
            this.modules,
            additionalFunctionValuesAndEffects,
            residualHeapValueIdentifiers,
            heapRefCounter.getResult(),
            referentializer
          );
          heapGraphGenerator.visitRoots();
          invariant(this.options.heapGraphFormat);
          heapGraph = heapGraphGenerator.generateResult(this.options.heapGraphFormat);
        }

        // Phase 2: Let's serialize the heap and generate code.
        // Serialize for the first time in order to gather reference counts

        if (this.options.inlineExpressions) {
          residualHeapValueIdentifiers.initPass1();
          statistics.referenceCounts.measure(() => {
            new ResidualHeapSerializer(
              this.realm,
              this.logger,
              this.modules,
              residualHeapValueIdentifiers,
              residualHeapVisitor.inspector,
              residualHeapVisitor.values,
              residualHeapVisitor.functionInstances,
              residualHeapVisitor.classMethodInstances,
              residualHeapVisitor.functionInfos,
              this.options,
              residualHeapVisitor.referencedDeclaredValues,
              additionalFunctionValuesAndEffects,
              residualHeapVisitor.additionalFunctionValueInfos,
              residualHeapVisitor.declarativeEnvironmentRecordsBindings,
              this.react,
              referentializer,
              residualHeapVisitor.generatorDAG,
              residualHeapVisitor.conditionalFeasibility,
              residualHeapVisitor.additionalGeneratorRoots
            ).serialize();
          });
          if (this.logger.hasErrors()) return undefined;
          residualHeapValueIdentifiers.initPass2();
        }

        // Serialize for a second time, using reference counts to minimize number of generated identifiers
        const TargetSerializer =
          this.options.lazyObjectsRuntime != null ? LazyObjectsSerializer : ResidualHeapSerializer;
        statistics.resetBeforePass();
        return statistics.serializePass.measure(() =>
          new TargetSerializer(
            this.realm,
            this.logger,
            this.modules,
            residualHeapValueIdentifiers,
            residualHeapVisitor.inspector,
            residualHeapVisitor.values,
            residualHeapVisitor.functionInstances,
            residualHeapVisitor.classMethodInstances,
            residualHeapVisitor.functionInfos,
            this.options,
            residualHeapVisitor.referencedDeclaredValues,
            additionalFunctionValuesAndEffects,
            residualHeapVisitor.additionalFunctionValueInfos,
            residualHeapVisitor.declarativeEnvironmentRecordsBindings,
            this.react,
            referentializer,
            residualHeapVisitor.generatorDAG,
            residualHeapVisitor.conditionalFeasibility,
            residualHeapVisitor.additionalGeneratorRoots
          ).serialize()
        );
      })();

      invariant(ast !== undefined);
      if (this.realm.stripFlow) {
        stripFlowTypeAnnotations(ast);
      }

      // the signature for generate is not complete, hence the any
      let generated = statistics.babelGenerate.measure(() => generate(ast, { sourceMaps: sourceMaps }, (code: any)));

      invariant(!this.logger.hasErrors());
      return {
        code: generated.code,
        map: generated.map,
        statistics,
        reactStatistics,
        heapGraph,
      };
    });

    if (this.options.logStatistics) {
      statistics.log();
      statistics.logSerializerPerformanceTrackers(
        "time statistics",
        statistics.forcingGC
          ? "Time statistics are skewed because of forced garbage collections; remove --expose-gc flag from node.js invocation to disable forced garbage collections."
          : undefined,
        pf => `${pf.time}ms`
      );
      statistics.logSerializerPerformanceTrackers(
        "memory statistics",
        statistics.forcingGC
          ? undefined
          : "Memory statistics are unreliable because garbage collections could not be forced; pass --expose-gc to node.js to enable forced garbage collections.",
        pf => `${pf.memory > 0 ? "+" : ""}${Math.round(pf.memory / 1024 / 1024)}MB`
      );
    }

    return result;
  }
}

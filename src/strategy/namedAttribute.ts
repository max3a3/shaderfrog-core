import { Program } from '@shaderfrog/glsl-parser/ast';
import { InputCategory, nodeInput } from '../nodes/core-node';
import { BaseStrategy, ApplyStrategy, StrategyType } from '.';
import { generateFiller } from 'src/util/ast';

export const namedAttributeStrategy = (
  attributeName: string
): NamedAttributeStrategy => ({
  type: StrategyType.NAMED_ATTRIBUTE,
  config: { attributeName },
});
export interface NamedAttributeStrategy extends BaseStrategy {
  type: StrategyType.NAMED_ATTRIBUTE;
  config: {
    attributeName: string;
  };
}

export const applyNamedAttributeStrategy: ApplyStrategy<
  NamedAttributeStrategy
> = (node, ast, strategy) => {
  const program = ast as Program;
  const { attributeName } = strategy.config;
  return [
    [
      nodeInput(
        attributeName,
        `filler_${attributeName}`,
        'filler',
        undefined, // Data type for what plugs into this filler
        new Set<InputCategory>(['code', 'data']),
        true
      ),
      (fillerAst) => {
        Object.entries(program.scopes[0].bindings).forEach(
          ([name, binding]) => {
            binding.references.forEach((ref) => {
              // Rename the variable usage only if it's not the identifier, to
              // avoid filling in `in vec3 replaceMe;` with `replacer()`
              if (
                ref.type === 'identifier' &&
                ref !== binding.declaration &&
                ref.identifier === attributeName
              ) {
                ref.identifier = generateFiller(fillerAst);
              }
            });
          }
        );
        return ast;
      },
    ],
  ];
};

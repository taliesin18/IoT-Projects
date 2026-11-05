"""Conservative preflight for the original studio's scene helper interface.

This is a quality filter, not a security sandbox. Execution still requires an
offline, resource-limited, per-project Docker container and explicit approval.
"""
import ast
import hashlib
import json
import re

HELPERS = {'sphere', 'box', 'cylinder', 'torus', 'tube', 'mascot', 'bowl', 'bottle', 'camera', 'group'}
MATH = {'sin', 'cos', 'pi', 'tau'}
TRANSFORMS = {'location', 'rotation_euler', 'scale', 'x', 'y', 'z'}
FORBIDDEN = (ast.For, ast.AsyncFor, ast.While, ast.With, ast.AsyncWith, ast.Try,
             ast.ClassDef, ast.Lambda, ast.ListComp, ast.SetComp, ast.DictComp,
             ast.GeneratorExp, ast.Global, ast.Nonlocal, ast.Delete, ast.AsyncFunctionDef,
             ast.Await, ast.Yield, ast.YieldFrom, ast.Raise)


def digest(code):
    return hashlib.sha256(code.encode('utf-8')).hexdigest()


def parse_model_code(content):
    text = content.strip()
    if text.startswith('```'):
        parts = text.split('\n', 1)
        text = parts[1].rsplit('```', 1)[0].strip() if len(parts) == 2 else ''
    try:
        result = json.loads(text)
        return result['code']
    except (ValueError, KeyError, TypeError) as exc:
        raise ValueError('The model did not return the requested code JSON. Try a simpler prompt.') from exc


def validate_code(code):
    if not isinstance(code, str) or not code.strip() or len(code.encode('utf-8')) > 12000:
        raise ValueError('Generated code must be nonempty and at most 12 KB.')
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        raise ValueError(f'Generated code has invalid Python syntax on line {exc.lineno}: {exc.msg}.') from exc
    nodes = list(ast.walk(tree))
    if len(nodes) > 600 or any(isinstance(n, FORBIDDEN) for n in nodes):
        raise ValueError('The scene exceeds complexity limits or uses unsupported control flow.')
    if any(not isinstance(n, (ast.Import, ast.ImportFrom, ast.FunctionDef)) for n in tree.body):
        raise ValueError('Only imports and the build function are allowed at module level.')
    functions = [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]
    if [n.name for n in tree.body if isinstance(n, ast.FunctionDef)] != ['build'] or any(n.name not in {'build', 'update'} for n in functions) or len(functions) != 2:
        raise ValueError('The scene must define build() and one nested update(t).')
    build = next(n for n in tree.body if isinstance(n, ast.FunctionDef))
    nested = [n for n in build.body if isinstance(n, ast.FunctionDef)]
    if len(nested) != 1 or nested[0].name != 'update' or nested[0].args.vararg or nested[0].args.kwarg or len(nested[0].args.args) != 1 or build.args.args or build.args.vararg or build.args.kwarg:
        raise ValueError('Use build() with one nested update(t).')
    if not any(isinstance(n, ast.Return) and isinstance(n.value, ast.Name) and n.value.id == 'update' for n in build.body):
        raise ValueError('build() must return update.')
    if sum(isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in HELPERS for n in nodes) > 30:
        raise ValueError('The scene uses too many helper calls.')
    for n in nodes:
        if isinstance(n, ast.Import) and any(x.name != 'math' or x.asname for x in n.names):
            raise ValueError('Only import math is supported.')
        if isinstance(n, ast.ImportFrom) and not (n.module == 'scene_api' and len(n.names) == 1 and n.names[0].name == '*' and not n.level):
            raise ValueError('Only the scene_api helper import is supported.')
        if isinstance(n, ast.Name) and (n.id.startswith('_') or (isinstance(n.ctx, ast.Store) and n.id in HELPERS | {'math'})):
            raise ValueError('Unsupported or shadowed name in scene code.')
        if isinstance(n, ast.Attribute):
            if n.attr not in TRANSFORMS | MATH or n.attr.startswith('_'):
                raise ValueError('Only math and object transform attributes are supported.')
            if isinstance(n.value, ast.Name) and n.value.id == 'math' and n.attr not in MATH:
                raise ValueError('Unsupported math operation.')
        if isinstance(n, ast.Call):
            allowed_name = isinstance(n.func, ast.Name) and n.func.id in HELPERS | {'abs', 'min', 'max'}
            allowed_math = isinstance(n.func, ast.Attribute) and isinstance(n.func.value, ast.Name) and n.func.value.id == 'math' and n.func.attr in {'sin', 'cos'}
            if not (allowed_name or allowed_math) or any(k.arg is None for k in n.keywords):
                raise ValueError('Only approved scene helpers and basic math calls are supported.')
        if isinstance(n, ast.Constant):
            if isinstance(n.value, str) and len(n.value) > 120:
                raise ValueError('A scene string is too long.')
            if isinstance(n.value, (float, int)) and abs(n.value) > 10000:
                raise ValueError('A scene number is out of range.')
    if any(isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in HELPERS for n in ast.walk(nested[0])):
        raise ValueError('Create objects in build(), not update().')
    compile(tree, '<reviewed-scene>', 'exec')
    return code


def validate_subject(code, prompt):
    """Catch known generic substitutions; this does not establish visual similarity."""
    tree = ast.parse(code)
    calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)]
    if any(call.func.id == 'mascot' for call in calls) and 'generic mascot' not in prompt.lower():
        raise ValueError('Do not use the generic mascot for a specific subject; construct its distinguishing parts with primitives.')
    if re.search(r'\b(puppy|dog|yorkie|yorkshire|terrier)\b', prompt, re.IGNORECASE):
        geometry = {'sphere', 'box', 'cylinder', 'torus', 'tube'}
        if sum(call.func.id in geometry for call in calls) < 6:
            raise ValueError('The requested dog needs multiple distinct primitive parts such as head, ears, eyes, body and legs; do not use a generic blob.')
    return code

export const seedContent = String.raw`## What is an algorithm?

An **algorithm** is a finite sequence of well-defined steps used to solve a problem.

For example, the problem might be to find a particular value in a list. The algorithm is the specific method we use to find it.

## Problem vs instance

| Concept | Meaning | Example |
| --- | --- | --- |
| Problem | A general task or question | Find a value in a list |
| Instance | One particular input | Find 8 in [5, 2, 8] |

> **Remember:** problem = general question; instance = actual input.

## Input size

Input size describes how much data an algorithm processes. For a list, we often use the number of elements, $n$.

~~~python
numbers = [5, 2, 8]
n = len(numbers)  # n = 3
~~~

The meaning of $n$ depends on the problem: it could be elements, characters, or vertices in a graph.

## Time vs space complexity

**Time complexity** describes how the amount of work grows as the input size $n$ increases.

**Space complexity** describes how memory use grows. **Auxiliary space** specifically measures additional memory beyond the input.

## Big-O: upper bound

We write $f(n)=O(g(n))$ if there exist constants $c>0$ and $n_0\geq 0$ such that, for every $n\geq n_0$:

$$
0\leq f(n)\leq c\,g(n)
$$

Big-O gives an asymptotic upper bound. For example, $3n+2=O(n)$ because $3n+2\leq 5n$ for $n\geq 1$.

## Big-Omega: lower bound

We write $f(n)=\Omega(g(n))$ if there exist constants $c>0$ and $n_0\geq 0$ such that, for every $n\geq n_0$:

$$
0\leq c\,g(n)\leq f(n)
$$

Omega gives an asymptotic lower bound.

## Big-Theta: tight bound

We write $f(n)=\Theta(g(n))$ when $g(n)$ is both an upper and a lower asymptotic bound. There exist positive constants $c_1,c_2$ and a threshold $n_0$ such that, for all $n\geq n_0$:

$$
0\leq c_1g(n)\leq f(n)\leq c_2g(n)
$$

Thus $3n+2=\Theta(n)$. These bounds describe growth; Big-O does not inherently mean worst case, and Omega does not inherently mean best case.

## Growth order

From slowest to fastest asymptotic growth:

$$
1 < \log n < n < n\log n < n^2 < n^3 < 2^n < n!
$$

This is a comparison for sufficiently large $n$, not a strict inequality at every small input. The logarithm has any fixed base greater than 1.
`;

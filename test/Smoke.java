package com.example.smoke;

import java.io.*;
import java.util.*;
import java.util.stream.Collectors;

@SuppressWarnings("unchecked")
public sealed interface Shape permits Circle, Square {}

record Circle(double r) implements Shape {}
record Square(double a) implements Shape {}

public class Smoke<T extends Comparable<? super T>> implements Closeable {

    private static final Map<String, List<Integer>> CACHE = new HashMap<>();
    private final ReadWriteLock lock = new ReentrantReadWriteLock();

    public <R> Optional<R> map(T in, Function<? super T, ? extends R> fn) {
        return Optional.ofNullable(in).map(fn);
    }

    public String describe(Shape s) {
        return switch (s) {
            case Circle c when c.r() > 10 -> "big circle";
            case Circle c -> "circle " + c.r();
            case Square q -> """
                square
                %s""".formatted(q.a());
        };
    }

    void resources(File f) throws IOException {
        try (var in = new BufferedReader(new FileReader(f));
             OutputStream out = new FileOutputStream("x")) {
            in.lines().filter(l -> !l.isBlank())
              .map(String::trim)
              .collect(Collectors.toList())
              .forEach(l -> { try { out.write(l.getBytes()); } catch (IOException e) { throw new UncheckedIOException(e); } });
        } catch (FileNotFoundException | SecurityException e) {
            throw new IOException(e);
        } finally {
            System.out.println("done");
        }
    }

    synchronized void locked() {
        lock.writeLock().lock();
        try {
            CACHE.computeIfAbsent("k", k -> new ArrayList<>()).add(1);
        } finally {
            lock.writeLock().unlock();
        }
    }

    static int[][] arrays() {
        int[][] m = new int[3][4];
        for (int i = 0; i < m.length; i++)
            for (int j = 0; j < m[i].length; ++j)
                m[i][j] = i * j;
        return m;
    }

    enum Color { RED, GREEN { int v() { return 2; } }; int v() { return 0; } }

    @Override public void close() { }

    class Inner { int x = 1; }
    static class Nested extends Smoke<String> { }

    public static void main(String... args) {
        Runnable r = new Runnable() { @Override public void run() { assert args.length >= 0 : "neg"; } };
        r.run();
        label: for (var a : args) { if (a == null) continue label; else break label; }
    }
}

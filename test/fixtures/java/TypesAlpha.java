package fixture.types;

// Type resolution, source 1: a local declaration says what `handle` is.
// Four units hold open+close on an Alpha and one deviates, so the rule
// `Alpha#open -> Alpha#close` has exactly one violation and is reported.
// TypesBeta.java holds six units calling `open` on a Beta and never closing it:
// if the receiver type stops being resolved, both collapse into `?#open`, the
// violation count jumps past --maxviol and the finding disappears. Any mutant
// that breaks type resolution therefore changes what this fixture reports.
public class TypesAlpha {

    private Alpha handle;

    public void alphaHolds1() {
        handle.open();
        handle.close();
    }

    public void alphaHolds2() {
        handle.open();
        handle.close();
    }

    public void alphaHolds3() {
        handle.open();
        handle.close();
    }

    public void alphaHolds4() {
        handle.open();
        handle.close();
    }

    public void alphaDeviates() {
        handle.open();
    }
}
